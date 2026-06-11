import { Effect } from "effect"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { EngramError } from "./errors.js"

const execFileAsync = promisify(execFile)

const git = (args: string[], cwd?: string): Effect.Effect<string, EngramError> =>
  Effect.tryPromise({
    try: () =>
      execFileAsync("git", args, cwd ? { cwd } : {}).then(({ stdout }) => stdout),
    catch: (e: unknown) => {
      const err = e as { stderr?: string; message?: string }
      return new EngramError({ message: `git ${args[0] ?? "?"} failed: ${err.stderr ?? err.message ?? String(e)}` })
    },
  })

export const resolveRemoteSha = (url: string, branch: string): Effect.Effect<string, EngramError> =>
  Effect.gen(function* () {
    const stdout = yield* git(["ls-remote", url, `refs/heads/${branch}`])
    const sha = stdout.trim().split("\n")[0]?.split(/\s+/)[0]
    if (!sha) {
      return yield* Effect.fail(
        new EngramError({ message: `branch '${branch}' not found at ${url}` }),
      )
    }
    return sha
  })

export const sparseCheckout = (
  url: string,
  skillPath: string,
  sha: string,
  destDir: string,
): Effect.Effect<void, EngramError> =>
  Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: async () => {
        await fs.rm(destDir, { recursive: true, force: true })
        await fs.mkdir(destDir, { recursive: true })
      },
      catch: (e) => new EngramError({ message: `preparing dest dir: ${String(e)}` }),
    })
    yield* git(["clone", "--filter=blob:none", "--no-checkout", "--depth=1", "--single-branch", url, destDir])
    yield* git(["sparse-checkout", "init", "--cone"], destDir)
    yield* git(["sparse-checkout", "set", skillPath], destDir)
    yield* git(["checkout", sha], destDir)
  })

export const copyDir = (src: string, dst: string): Effect.Effect<void, EngramError> =>
  Effect.tryPromise({
    try: () => copyDirNode(src, dst),
    catch: (e) => new EngramError({ message: `copy failed: ${String(e)}` }),
  })

async function copyDirNode(src: string, dst: string): Promise<void> {
  await fs.mkdir(dst, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === ".git") continue
    const s = path.join(src, entry.name)
    const d = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      await copyDirNode(s, d)
    } else {
      await fs.copyFile(s, d)
    }
  }
}
