import { Command, FileSystem } from "@effect/platform";
import { Effect } from "effect";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { EngramError } from "./errors.js";

/** Canonical store: skills are materialized once here, then symlinked into each provider dir. */
export function storeDir(): string {
  const base = process.env["XDG_DATA_HOME"] ?? path.join(os.homedir(), ".local", "share");
  return path.join(base, "engram", "store");
}

const git = (args: string[], cwd?: string) => {
  const base = Command.make("git", ...args);
  const cmd = cwd ? base.pipe(Command.workingDirectory(cwd)) : base;
  return Command.string(cmd).pipe(
    Effect.mapError((e) => new EngramError({ message: `git ${args[0] ?? "?"} failed: ${e.message}` }))
  );
};

export const resolveRemoteSha = (url: string, branch: string) =>
  Effect.gen(function* () {
    const stdout = yield* git(["ls-remote", url, `refs/heads/${branch}`]);
    const sha = stdout.trim().split("\n")[0]?.split(/\s+/)[0];
    if (!sha) {
      return yield* Effect.fail(
        new EngramError({ message: `branch '${branch}' not found at ${url}` }),
      );
    }
    return sha;
  });

export const resolveDefaultBranch = (url: string) =>
  Effect.gen(function* () {
    const stdout = yield* git(["ls-remote", "--symref", url, "HEAD"]);
    // Output: "ref: refs/heads/main\tHEAD\n<sha>\tHEAD"
    const match = stdout.match(/ref:\s+refs\/heads\/([^\s]+)/);
    const branch = match?.[1];
    if (!branch) {
      return yield* Effect.fail(
        new EngramError({ message: `could not determine default branch for ${url}` }),
      );
    }
    return branch;
  });

export const sparseCheckout = (url: string, skillPath: string, sha: string, destDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.remove(destDir, { recursive: true }).pipe(Effect.ignore);
    yield* fs.makeDirectory(destDir, { recursive: true }).pipe(
      Effect.mapError((e) => new EngramError({ message: `preparing dest dir: ${e.message}` }))
    );
    // Fetch the exact commit (works for pinned SHAs, not just branch tips), with a
    // blobless partial clone so only the sparse skill path's blobs are downloaded.
    yield* git(["init", "-q"], destDir);
    yield* git(["remote", "add", "origin", url], destDir);
    yield* git(["fetch", "--filter=blob:none", "--depth=1", "origin", sha], destDir);
    yield* git(["sparse-checkout", "init", "--cone"], destDir);
    yield* git(["sparse-checkout", "set", skillPath], destDir);
    yield* git(["checkout", "--detach", "FETCH_HEAD"], destDir);
  });

/**
 * Link a canonical skill copy into a provider directory. Prefers a symlink (single source
 * of truth, cheap updates) and falls back to a deep copy where symlinks aren't available.
 */
export const linkSkill = (canonical: string, dest: string): Effect.Effect<void, EngramError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(path.dirname(dest), { recursive: true }).pipe(
      Effect.mapError((e) => new EngramError({ message: `linking skill: ${e.message}` }))
    );
    yield* fs.remove(dest, { recursive: true }).pipe(Effect.ignore);
    yield* Effect.tryPromise({
      try: () => fsp.symlink(canonical, dest, "dir"),
      catch: (e) => new EngramError({ message: String(e) }),
    }).pipe(Effect.catchAll(() => copyDir(canonical, dest)));
  });

export const copyDir = (src: string, dst: string): Effect.Effect<void, EngramError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(dst, { recursive: true }).pipe(
      Effect.mapError((e) => new EngramError({ message: `copy failed: ${e.message}` }))
    );
    const names = yield* fs.readDirectory(src).pipe(
      Effect.mapError((e) => new EngramError({ message: `copy failed: ${e.message}` }))
    );
    yield* Effect.forEach(
      names.filter((n) => n !== ".git"),
      (name) =>
        Effect.gen(function* () {
          const s = path.join(src, name);
          const d = path.join(dst, name);
          const info = yield* fs.stat(s).pipe(
            Effect.mapError((e) => new EngramError({ message: `copy failed: ${e.message}` }))
          );
          if (info.type === "Directory") {
            yield* copyDir(s, d);
          } else {
            yield* fs.copyFile(s, d).pipe(
              Effect.mapError((e) => new EngramError({ message: `copy failed: ${e.message}` }))
            );
          }
        }),
      { concurrency: "unbounded" }
    );
  });
