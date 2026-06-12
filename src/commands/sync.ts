import { Console, Effect } from "effect";
import { loadManifest } from "../manifest.js";
import { parseProvider } from "../providers/index.js";
import { installSkill } from "./install.js";

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

    for (const [id, entry] of entries) {
      yield* Console.log(`  ${id}${entry.sha ? ` @ ${entry.sha.slice(0, 12)}` : ""}`);
      const providers = yield* Effect.forEach(entry.providers ?? [], parseProvider);
      yield* installSkill({
        source: entry.source,
        skill: entry.skill,
        providers,
        scope: "project",
        branch: entry.branch ?? "main",
        path: entry.path ?? ".",
        sha: entry.sha,
      });
    }

    yield* Console.log("✓ Sync complete.");
  });
