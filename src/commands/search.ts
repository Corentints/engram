import { Console, Effect, Stream } from "effect";
import { Command, FileSystem } from "@effect/platform";
import type { CommandExecutor } from "@effect/platform";
import * as os from "node:os";
import * as path from "node:path";
import { EngramError } from "../errors.js";
import { resolveUrl, skillId } from "../source.js";
import { extractDescription } from "../skill.js";

/** Drain a byte stream (a process's stdout/stderr) into a decoded string. */
const collectText = <E, R>(stream: Stream.Stream<Uint8Array, E, R>): Effect.Effect<string, E, R> =>
  Stream.mkString(Stream.decodeText(stream));

export interface RemoteSkill {
  path: string
  description?: string
}

export interface RemoteListing {
  /** Effective sub-directory the skills are relative to (`.` for repo root). */
  basePath: string
  skills: RemoteSkill[]
}

export const run = (
  source: string,
  query: string | undefined,
  subPath: string,
): Effect.Effect<void, EngramError, CommandExecutor.CommandExecutor | FileSystem.FileSystem> =>
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

export function listRemoteSkills(
  url: string,
  registryPath: string,
): Effect.Effect<RemoteListing, EngramError, CommandExecutor.CommandExecutor | FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const tmp = path.join(os.tmpdir(), "engram-search");

    // Run a git command in `tmp`, capturing stdout. Unlike Command.string, this surfaces a
    // non-zero exit (e.g. a bad source URL) as a failure carrying the process's stderr.
    const git = (...args: string[]) =>
      Effect.gen(function* () {
        const command = Command.make("git", ...args).pipe(Command.workingDirectory(tmp));
        const proc = yield* Command.start(command);
        const [stdout, stderr, exitCode] = yield* Effect.all(
          [collectText(proc.stdout), collectText(proc.stderr), proc.exitCode],
          { concurrency: "unbounded" },
        );
        if (exitCode !== 0) {
          const detail = (stderr || stdout || `git exited with ${String(exitCode)}`).trim();
          return yield* Effect.fail(new EngramError({ message: `search failed: ${detail}` }));
        }
        return stdout;
      }).pipe(
        Effect.scoped,
        Effect.mapError((e) =>
          e instanceof EngramError ? e : new EngramError({ message: `search failed: ${e.message}` }),
        ),
      );

    yield* fs.remove(tmp, { recursive: true }).pipe(Effect.ignore);
    yield* fs.makeDirectory(tmp, { recursive: true }).pipe(
      Effect.mapError((e) => new EngramError({ message: e.message })),
    );

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
        // Prefer SKILL.md (spec-compliant), fall back to any .md for legacy repos
        const relMdFile =
          allFiles.find((f) => f === `${dir}SKILL.md`) ??
          allFiles.find((f) => f.startsWith(dir) && f.endsWith(".md"));
        if (!relMdFile) return Effect.succeed({ path: skillPath });
        return git("show", `HEAD:${absPrefix}${relMdFile}`).pipe(
          Effect.map((stdout) => {
            const description = extractDescription(stdout);
            return description !== undefined ? { path: skillPath, description } : { path: skillPath };
          }),
          Effect.orElse(() => Effect.succeed({ path: skillPath })),
        );
      },
      { concurrency: "unbounded" },
    );

    yield* fs.remove(tmp, { recursive: true }).pipe(Effect.ignore);

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


