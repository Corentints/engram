import { Console, Effect } from "effect";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { loadConfig, type RegistryEntry } from "../config.js";
import { loadManifest } from "../manifest.js";
import { ALL_PROVIDERS, globalSkillsDir, projectSkillsDir } from "../providers/index.js";
import { EngramError } from "../errors.js";

export const run = (scopeFilter: string | undefined): Effect.Effect<void, EngramError> =>
  Effect.gen(function* () {
    const showGlobal = scopeFilter === undefined || scopeFilter === "global";
    const showProject = scopeFilter === undefined || scopeFilter === "project";
    let any = false;

    if (showGlobal) {
      const globalSkills = yield* listGlobalSkills();
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
      const [manifest, config] = yield* Effect.all([loadManifest(cwd), loadConfig()]);
      const entries = Object.entries(manifest.skills);
      if (entries.length > 0) {
        yield* Console.log("Project skills:");
        for (const [key, entry] of entries) {
          const providers = (entry.providers ?? []).join(", ");
          const branchHint = entry.branch ? ` (${entry.branch})` : "";
          const description = yield* readProjectSkillDescription(cwd, key, config.registries, entry.providers ?? []);
          const desc = description !== undefined ? `  — ${description}` : "";
          yield* Console.log(`  ${key}${branchHint}  [${providers}]${desc}`);
        }
        any = true;
      }
    }

    if (!any) {
      yield* Console.log("No skills installed. Use `engram install registry/skill` to install one.");
    }
  });

interface SkillListing {
  name: string
  providers: string[]
  description?: string
}

function listGlobalSkills(): Effect.Effect<SkillListing[], EngramError> {
  return Effect.tryPromise({
    try: async () => {
      const map = new Map<string, { providers: string[]; description?: string }>();
      for (const provider of ALL_PROVIDERS) {
        const dir = globalSkillsDir(provider);
        const leaves = await findLeafDirs(dir);
        for (const relPath of leaves) {
          const entry = map.get(relPath) ?? { providers: [] };
          entry.providers.push(provider);
          if (entry.description === undefined) {
            const desc = await readLocalDescription(path.join(dir, relPath), relPath);
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
    },
    catch: (e) => new EngramError({ message: String(e) }),
  });
}

async function findLeafDirs(baseDir: string, relPath = ""): Promise<string[]> {
  const fullPath = relPath ? path.join(baseDir, relPath) : baseDir;
  const entries = await fs.readdir(fullPath, { withFileTypes: true }).catch(() => null);
  if (!entries) return [];
  const hasFiles = entries.some((e) => !e.isDirectory());
  if (hasFiles) return relPath ? [relPath] : [];
  const results: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
    results.push(...(await findLeafDirs(baseDir, childRel)));
  }
  return results;
}

async function readLocalDescription(skillDir: string, skillRelPath: string): Promise<string | undefined> {
  const skillName = path.basename(skillRelPath);
  const content = await fs.readFile(path.join(skillDir, `${skillName}.md`), "utf-8").catch(() => null);
  if (!content) return undefined;
  return extractFirstLine(content);
}

function readProjectSkillDescription(
  cwd: string,
  skillRef: string,
  registries: Record<string, RegistryEntry>,
  providers: string[],
): Effect.Effect<string | undefined> {
  return Effect.tryPromise({
    try: async () => {
      const skillRelPath = resolveSkillRelPath(skillRef, registries);
      if (!skillRelPath) return undefined;
      const firstProvider = providers[0];
      if (!firstProvider) return undefined;
      const providerDir = firstProvider === "claude"
        ? projectSkillsDir("claude", cwd)
        : projectSkillsDir("copilot", cwd);
      return readLocalDescription(path.join(providerDir, skillRelPath), skillRelPath);
    },
    catch: () => undefined as never,
  });
}

function resolveSkillRelPath(skillRef: string, registries: Record<string, RegistryEntry>): string | undefined {
  const sortedNames = Object.keys(registries).sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    if (skillRef.startsWith(name + "/")) {
      const relPath = skillRef.slice(name.length + 1);
      if (relPath) return relPath;
    }
  }
  return undefined;
}

function extractFirstLine(content: string): string | undefined {
  const lines = content.split("\n");
  let i = 0;
  if (lines[0]?.trim() === "---") {
    i = 1;
    while (i < lines.length && lines[i]?.trim() !== "---") i++;
    i++;
  }
  while (i < lines.length) {
    const trimmed = lines[i]?.trim() ?? "";
    if (trimmed && !trimmed.startsWith("#")) return trimmed;
    i++;
  }
  return undefined;
}
