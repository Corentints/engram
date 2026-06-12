import { Console, Effect } from "effect";
import { loadManifest } from "../manifest.js";
import { run as installRun } from "./install.js";

export const run = (dir: string | undefined) =>
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
      yield* Console.log(`  ${skillRef}${entry.sha ? ` @ ${entry.sha.slice(0, 12)}` : ""}`);
      yield* installRun({
        skillRef,
        providers: entry.providers ?? [],
        scope: "project",
        branch: entry.branch,
        sha: entry.sha,
      });
    }

    yield* Console.log("✓ Sync complete.");
  });
