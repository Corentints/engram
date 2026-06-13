import { Console, Effect, Option } from "effect";
import { FileSystem } from "@effect/platform";
import * as path from "node:path";
import { loadManifest } from "../manifest.js";
import { ALL_PROVIDERS, globalSkillsDir, parseProvider, projectSkillsDir } from "../providers/index.js";
import { EngramError } from "../errors.js";
import { extractDescription } from "../skill.js";

export const run = (
  scopeFilter: string | undefined,
): Effect.Effect<void, EngramError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const showGlobal = scopeFilter === undefined || scopeFilter === "global";
    const showProject = scopeFilter === undefined || scopeFilter === "project";
    let any = false;

    if (showGlobal) {
      const globalSkills = yield* listGlobalSkills(fs);
      if (globalSkills.length > 0) {
        yield* Console.log("Global skills:");
        for (const { name, providers, description } of globalSkills) {
          const desc = description !== undefined ? `  — ${description}` : "";
          yield* Console.log(`  ${name}  [${providers.join(", ")}]${desc}`);
        }
        any = true;
      }
    }

    if (showProject) {
      const cwd = process.cwd();
      const manifest = yield* loadManifest(cwd);
      const entries = Object.entries(manifest.skills);
      if (entries.length > 0) {
        yield* Console.log("Project skills:");
        for (const [id, entry] of entries) {
          const providers = (entry.providers ?? []).join(", ");
          const branchHint = entry.branch ? ` (${entry.branch})` : "";
          const description = yield* readProjectSkillDescription(fs, cwd, entry.skill, entry.providers ?? []);
          const desc = description !== undefined ? `  — ${description}` : "";
          yield* Console.log(`  ${id}${branchHint}  [${providers}]${desc}`);
        }
        any = true;
      }
    }

    if (!any) {
      yield* Console.log("No skills installed. Use `engram add owner/repo` to install one.");
    }
  });

interface SkillListing {
  name: string
  providers: string[]
  description?: string
}

function listGlobalSkills(fs: FileSystem.FileSystem): Effect.Effect<SkillListing[]> {
  return Effect.gen(function* () {
    const map = new Map<string, { providers: string[]; description?: string }>();
    for (const provider of ALL_PROVIDERS) {
      const dir = globalSkillsDir(provider);
      const leaves = yield* findLeafDirs(fs, dir);
      for (const relPath of leaves) {
        const entry = map.get(relPath) ?? { providers: [] };
        entry.providers.push(provider);
        if (entry.description === undefined) {
          const desc = yield* readLocalDescription(fs, path.join(dir, relPath), relPath);
          if (desc !== undefined) entry.description = desc;
        }
        map.set(relPath, entry);
      }
    }
    return Array.from(map.entries()).map(([name, { providers, description }]): SkillListing => {
      const listing: SkillListing = { name, providers };
      if (description !== undefined) listing.description = description;
      return listing;
    });
  });
}

/**
 * Walk `baseDir` and return the relative paths of its leaf skill directories — a leaf being a
 * directory that holds files. Symlinks are followed (`fs.stat`), since installed skills are
 * symlinks into the canonical store. Unreadable paths are treated as empty.
 */
function findLeafDirs(
  fs: FileSystem.FileSystem,
  baseDir: string,
  relPath = "",
): Effect.Effect<string[]> {
  return Effect.gen(function* () {
    const fullPath = relPath ? path.join(baseDir, relPath) : baseDir;
    const names = yield* fs.readDirectory(fullPath).pipe(Effect.orElseSucceed(() => []));
    const entries = yield* Effect.forEach(names, (name) =>
      fs.stat(path.join(fullPath, name)).pipe(
        Effect.map((info) => ({ name, isDir: info.type === "Directory" })),
        Effect.orElseSucceed(() => ({ name, isDir: false })),
      ),
    );
    if (entries.some((e) => !e.isDir)) return relPath ? [relPath] : [];
    const nested = yield* Effect.forEach(
      entries.filter((e) => e.isDir),
      (e) => findLeafDirs(fs, baseDir, relPath ? `${relPath}/${e.name}` : e.name),
    );
    return nested.flat();
  });
}

function readLocalDescription(
  fs: FileSystem.FileSystem,
  skillDir: string,
  skillRelPath: string,
): Effect.Effect<string | undefined> {
  return Effect.gen(function* () {
    const skillName = path.basename(skillRelPath);
    const readMaybe = (file: string) =>
      fs.readFileString(path.join(skillDir, file)).pipe(Effect.orElseSucceed(() => undefined));
    // Prefer SKILL.md (spec-compliant), fall back to {skillName}.md for legacy repos
    const content = (yield* readMaybe("SKILL.md")) ?? (yield* readMaybe(`${skillName}.md`));
    return content !== undefined ? extractDescription(content) : undefined;
  });
}

function readProjectSkillDescription(
  fs: FileSystem.FileSystem,
  cwd: string,
  skill: string,
  providers: string[],
): Effect.Effect<string | undefined> {
  return Effect.gen(function* () {
    const firstProvider = providers[0];
    if (firstProvider === undefined) return undefined;
    // Resolve against the provider registry rather than hard-coding known ids.
    const provider = yield* parseProvider(firstProvider).pipe(Effect.option);
    if (Option.isNone(provider)) return undefined;
    const dir = projectSkillsDir(provider.value, cwd);
    return yield* readLocalDescription(fs, path.join(dir, skill), skill);
  });
}

