import { Console, Effect } from "effect";
import { loadManifest } from "../manifest.js";
import { run as installRun } from "./install.js";
import { EngramError } from "../errors.js";

export const run = (dir: string | undefined): Effect.Effect<void, EngramError> =>
  Effect.gen(function* () {
    const projectDir = dir ?? process.cwd();
    const manifest = yield* loadManifest(projectDir);
    const entries = Object.entries(manifest.skills);

    if (entries.length === 0) {
      yield* Console.log("No skills declared in engram.json.");
      return;
    }

    yield* Console.log(`Syncing ${String(entries.length)} skill(s)...`);

    for (const [skillRef, entry] of entries) {
      yield* Console.log(`  ${skillRef}`);
      yield* installRun({
        skillRef,
        providers: entry.providers ?? [],
        scope: "project",
        branch: entry.branch,
      });
    }

    yield* Console.log("✓ Sync complete.");
  });
