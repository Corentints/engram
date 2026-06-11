import { Command, FileSystem } from "@effect/platform";
import { Effect } from "effect";
import * as path from "node:path";
import { EngramError } from "./errors.js";

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

export const sparseCheckout = (url: string, skillPath: string, sha: string, destDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.remove(destDir, { recursive: true }).pipe(Effect.ignore);
    yield* fs.makeDirectory(destDir, { recursive: true }).pipe(
      Effect.mapError((e) => new EngramError({ message: `preparing dest dir: ${e.message}` }))
    );
    yield* git(["clone", "--filter=blob:none", "--no-checkout", "--depth=1", "--single-branch", url, destDir]);
    yield* git(["sparse-checkout", "init", "--cone"], destDir);
    yield* git(["sparse-checkout", "set", skillPath], destDir);
    yield* git(["checkout", sha], destDir);
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
