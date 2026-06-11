import { Console, Effect } from "effect";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadConfig } from "../config.js";
import { EngramError } from "../errors.js";

const execFileAsync = promisify(execFile);

export const run = (query: string, registryFilter: string | undefined): Effect.Effect<void, EngramError> =>
  Effect.gen(function* () {
    const config = yield* loadConfig();

    if (Object.keys(config.registries).length === 0) {
      return yield* Effect.fail(
        new EngramError({ message: "no registries configured. Run `engram registry add` first." }),
      );
    }

    const registries =
      registryFilter !== undefined
        ? (() => {
            const entry = config.registries[registryFilter];
            if (!entry) {
              return Effect.fail(
                new EngramError({ message: `registry '${registryFilter}' not found` }),
              );
            }
            return Effect.succeed([[registryFilter, entry]] as [string, typeof entry][]);
          })()
        : Effect.succeed(Object.entries(config.registries));

    const entries = yield* registries;

    for (const [name, registry] of entries) {
      yield* Console.log(`Registry: ${name}`);
      const skills = yield* listRemoteSkills(registry.url, registry.path);
      const matches = skills.filter(
        (s) => query === "" || s.toLowerCase().includes(query.toLowerCase()),
      );
      if (matches.length === 0) {
        yield* Console.log(`  No skills matching '${query}'`);
      } else {
        for (const skill of matches) {
          yield* Console.log(`  ${name}/${skill}`);
        }
      }
    }
  });

function listRemoteSkills(url: string, registryPath: string): Effect.Effect<string[], EngramError> {
  return Effect.tryPromise({
    try: async () => {
      const tmp = path.join(os.tmpdir(), "engram-search");
      await fs.rm(tmp, { recursive: true, force: true });
      await fs.mkdir(tmp, { recursive: true });

      await execFileAsync("git", [
        "clone",
        "--filter=blob:none",
        "--no-checkout",
        "--depth=1",
        url,
        tmp,
      ]);

      const treeRef = registryPath === "." ? "HEAD" : `HEAD:${registryPath}`;
      const { stdout } = await execFileAsync("git", ["ls-tree", "--name-only", treeRef], { cwd: tmp });

      await fs.rm(tmp, { recursive: true, force: true });

      return stdout
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    },
    catch: (e: unknown) => {
      const err = e as { stderr?: string; message?: string };
      return new EngramError({ message: `search failed: ${err.stderr ?? err.message ?? String(e)}` });
    },
  });
}
