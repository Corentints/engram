import { Console, Effect, Option } from "effect";
import { FileSystem } from "@effect/platform";
import * as path from "node:path";
import { styleText } from "node:util";
import { confirm, groupMultiselect, isCancel, multiselect } from "@clack/prompts";
import { loadManifest, type SkillEntry } from "../manifest.js";
import { ALL_PROVIDERS, globalSkillsDir, parseProvider, projectSkillsDir } from "../providers/index.js";
import { EngramError } from "../errors.js";
import { extractDescription } from "../skill.js";
import * as RemoveCmd from "./remove.js";

export const run = (
  scopeFilter: string | undefined,
): Effect.Effect<void, EngramError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    if (!isInteractive()) {
      yield* runReadOnly(scopeFilter);
      return;
    }

    const fs = yield* FileSystem.FileSystem;
    const globalSkills = scopeFilter === undefined || scopeFilter === "global"
      ? yield* listGlobalSkills(fs)
      : [];
    const projectEntries = scopeFilter === undefined || scopeFilter === "project"
      ? yield* listProjectSkills()
      : [];

    const options = buildOptions(globalSkills, projectEntries);
    if (options.length === 0) {
      yield* Console.log("No skills installed. Use `engram add owner/repo` to install one.");
      return;
    }

    const selected = yield* selectSkills(options);
    if (selected.length === 0) {
      yield* Console.log("No skills selected.");
      return;
    }

    const shouldRemove = yield* confirmRemoval(selected.length);
    if (!shouldRemove) {
      yield* Console.log("Cancelled.");
      return;
    }

    yield* Effect.forEach(selected, (value) => removeSkill(value), { discard: true });
    yield* Console.log(`✓ Removed ${String(selected.length)} skill(s).`);
  });

function isInteractive(): boolean {
  return typeof process.stdin.isTTY === "boolean" && process.stdin.isTTY;
}

// ── read-only listing (non-TTY fallback) ──────────────────────────────────────

function runReadOnly(
  scopeFilter: string | undefined,
): Effect.Effect<void, EngramError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
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
      const entries = yield* listProjectSkills();
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
}

// ── skill discovery ───────────────────────────────────────────────────────────

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

function listProjectSkills() {
  return Effect.gen(function* () {
    const cwd = process.cwd();
    const manifest = yield* loadManifest(cwd);
    return Object.entries(manifest.skills);
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

// ── interactive selection ─────────────────────────────────────────────────────

interface SelectableOption {
  value: string
  label: string
  hint?: string
  group: "Global" | "Project"
}

function truncate(text: string, max = 55): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function buildOptions(
  globalSkills: SkillListing[],
  projectEntries: Array<[string, SkillEntry]>,
): SelectableOption[] {
  const options: SelectableOption[] = [];

  for (const skill of globalSkills) {
    options.push({
      value: `global:${skill.name}`,
      label: skill.name,
      group: "Global",
      ...(skill.description !== undefined && { hint: truncate(skill.description) }),
    });
  }

  for (const [id, entry] of projectEntries) {
    const providers = (entry.providers ?? []).join(", ");
    const branchHint = entry.branch ? ` (${entry.branch})` : "";
    options.push({
      value: `project:${id}`,
      label: `${id}${branchHint}`,
      group: "Project",
      ...(providers !== "" && { hint: providers }),
    });
  }

  return options;
}

function selectSkills(options: SelectableOption[]): Effect.Effect<string[], EngramError> {
  return Effect.tryPromise({
    try: async () => {
      const hasGroups = options.some((o) => o.group !== options[0]?.group);
      const hint = styleText("dim", "↑↓ navigate  ·  space toggle   ·  enter confirm");
      const result = hasGroups
        ? await groupMultiselect<string>({
            message: `Select skills to remove\n  ${hint}`,
            options: buildGroupedOptions(options),
            required: false,
          })
        : await multiselect<string>({
            message: `Select skills to remove\n  ${hint}`,
            options: options.map((o) => ({
              value: o.value,
              label: o.label,
              ...(o.hint !== undefined && { hint: o.hint }),
            })),
            required: false,
          });
      if (isCancel(result)) return [];
      return result;
    },
    catch: (e) => new EngramError({ message: String(e) }),
  });
}

function buildGroupedOptions(
  options: SelectableOption[],
): Record<string, Array<{ value: string; label: string; hint?: string }>> {
  const groups: Record<string, Array<{ value: string; label: string; hint?: string }>> = {};
  for (const option of options) {
    (groups[option.group] ??= []).push({
      value: option.value,
      label: option.label,
      ...(option.hint !== undefined && { hint: option.hint }),
    });
  }
  return groups;
}

function confirmRemoval(count: number): Effect.Effect<boolean, EngramError> {
  return Effect.tryPromise({
    try: async () => {
      const result = await confirm({
        message: `Remove ${String(count)} skill${count === 1 ? "" : "s"}?`,
      });
      if (isCancel(result)) return false;
      return result;
    },
    catch: (e) => new EngramError({ message: String(e) }),
  });
}

function removeSkill(value: string): Effect.Effect<void, EngramError, FileSystem.FileSystem> {
  const colonIndex = value.indexOf(":");
  if (colonIndex === -1) {
    return Effect.fail(new EngramError({ message: `invalid skill selection: ${value}` }));
  }
  const scope = value.slice(0, colonIndex);
  const ref = value.slice(colonIndex + 1);
  if (scope !== "global" && scope !== "project") {
    return Effect.fail(new EngramError({ message: `invalid skill scope: ${scope}` }));
  }
  return RemoveCmd.run(ref, scope, false);
}
