import { Console, Effect } from "effect";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { EngramError } from "../errors.js";
import { resolveUrl, skillId } from "../source.js";

const execFileAsync = promisify(execFile);

export interface RemoteSkill {
  path: string
  description?: string
}

export interface RemoteListing {
  /** Effective sub-directory the skills are relative to (`.` for repo root). */
  basePath: string
  skills: RemoteSkill[]
}

export const run = (source: string, query: string | undefined, subPath: string): Effect.Effect<void, EngramError> =>
  Effect.gen(function* () {
    const url = resolveUrl(source);
    yield* Console.log(`Listing skills in ${source}...`);
    const { skills } = yield* listRemoteSkills(url, subPath);
    const matches = skills.filter(
      (s) => !query || s.path.toLowerCase().includes(query.toLowerCase()),
    );
    if (matches.length === 0) {
      yield* Console.log(`  No skills${query ? ` matching '${query}'` : ""} found.`);
      return;
    }
    for (const skill of matches) {
      const desc = skill.description !== undefined ? `  — ${skill.description}` : "";
      yield* Console.log(`  ${skillId(source, skill.path)}${desc}`);
    }
  });

export function listRemoteSkills(url: string, registryPath: string): Effect.Effect<RemoteListing, EngramError> {
  return Effect.gen(function* () {
    const tmp = path.join(os.tmpdir(), "engram-search");

    const git = (...args: string[]) =>
      Effect.tryPromise({
        try: () => execFileAsync("git", args, { cwd: tmp }).then(({ stdout }) => stdout),
        catch: (e: unknown) => {
          const err = e as { stderr?: string; message?: string };
          return new EngramError({ message: `search failed: ${err.stderr ?? err.message ?? String(e)}` });
        },
      });

    yield* Effect.tryPromise({
      try: () => fs.rm(tmp, { recursive: true, force: true }).then(() => fs.mkdir(tmp, { recursive: true })),
      catch: (e) => new EngramError({ message: String(e) }),
    });

    yield* git("clone", "--filter=blob:none", "--no-checkout", "--depth=1", url, tmp);

    const treeRef = registryPath === "." ? "HEAD" : `HEAD:${registryPath}`;
    const absPrefix = registryPath === "." ? "" : `${registryPath.replace(/\/$/, "")}/`;
    const allFiles = (yield* git("ls-tree", "-r", "--name-only", treeRef)).split("\n").filter(Boolean);
    let skillPaths = extractSkillPaths(allFiles);

    // When pointed at the repo root, auto-detect a single wrapping dir (e.g. `skills/`)
    // so callers can reference skills relative to it.
    let basePath = registryPath;
    let skillFilePrefix = "";
    if (registryPath === ".") {
      const root = detectSkillRoot(skillPaths);
      if (root) {
        basePath = root;
        skillFilePrefix = root + "/";
        skillPaths = skillPaths.map((p) => p.slice(root.length + 1));
      }
    }

    const skills = yield* Effect.forEach(
      skillPaths,
      (skillPath) => {
        const dir = `${skillFilePrefix}${skillPath}/`;
        const relMdFile = allFiles.find((f) => f.startsWith(dir) && f.endsWith(".md"));
        if (!relMdFile) return Effect.succeed({ path: skillPath });
        return git("show", `HEAD:${absPrefix}${relMdFile}`).pipe(
          Effect.map((stdout) => {
            const description = extractFirstLine(stdout);
            return description !== undefined ? { path: skillPath, description } : { path: skillPath };
          }),
          Effect.orElse(() => Effect.succeed({ path: skillPath })),
        );
      },
      { concurrency: "unbounded" },
    );

    yield* Effect.tryPromise({
      try: () => fs.rm(tmp, { recursive: true, force: true }),
      catch: () => new EngramError({ message: "cleanup failed" }),
    });

    return { basePath, skills };
  });
}


function detectSkillRoot(skillPaths: string[]): string | undefined {
  if (skillPaths.length === 0) return undefined;
  const first = skillPaths[0];
  if (!first) return undefined;
  const slash = first.indexOf("/");
  if (slash <= 0) return undefined;
  const candidate = first.slice(0, slash);
  if (skillPaths.every((p) => p.startsWith(candidate + "/"))) return candidate;
  return undefined;
}

function extractSkillPaths(files: string[]): string[] {
  const parentDirs = new Set<string>();
  for (const file of files) {
    const lastSlash = file.lastIndexOf("/");
    if (lastSlash > 0) {
      parentDirs.add(file.slice(0, lastSlash));
    }
  }
  const sorted = [...parentDirs].sort();
  // Keep only leaf directories (not ancestors of deeper skill dirs)
  return sorted.filter((dir) => !sorted.some((other) => other !== dir && other.startsWith(dir + "/")));
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
