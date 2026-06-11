import { Console, Effect } from "effect";
import * as fs from "node:fs/promises";
import { loadManifest } from "../manifest.js";
import { ALL_PROVIDERS, globalSkillsDir } from "../providers.js";
import { EngramError } from "../errors.js";

export const run = (scopeFilter: string | undefined): Effect.Effect<void, EngramError> =>
  Effect.gen(function* () {
    const showGlobal = scopeFilter === undefined || scopeFilter === "global";
    const showProject = scopeFilter === undefined || scopeFilter === "project";
    let any = false;

    if (showGlobal) {
      const globalSkills = yield* listGlobalSkills();
      if (globalSkills.length > 0) {
        yield* Console.log("Global skills:");
        for (const { name, providers } of globalSkills) {
          yield* Console.log(`  ${name}  [${providers.join(", ")}]`);
        }
        any = true;
      }
    }

    if (showProject) {
      const manifest = yield* loadManifest(process.cwd());
      const entries = Object.entries(manifest.skills);
      if (entries.length > 0) {
        yield* Console.log("Project skills:");
        for (const [key, entry] of entries) {
          const providers = (entry.providers ?? []).join(", ");
          const branchHint = entry.branch ? ` (${entry.branch})` : "";
          yield* Console.log(`  ${key}${branchHint}  [${providers}]`);
        }
        any = true;
      }
    }

    if (!any) {
      yield* Console.log("No skills installed. Use `engram install registry/skill` to install one.");
    }
  });

interface SkillListing {
  name: string
  providers: string[]
}

function listGlobalSkills(): Effect.Effect<SkillListing[], EngramError> {
  return Effect.tryPromise({
    try: async () => {
      const map = new Map<string, string[]>();
      for (const provider of ALL_PROVIDERS) {
        const dir = globalSkillsDir(provider);
        let entries: { name: string; isDirectory(): boolean }[];
        try {
          entries = await fs.readdir(dir, { withFileTypes: true, encoding: "utf8" });
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const existing = map.get(entry.name) ?? [];
          existing.push(provider);
          map.set(entry.name, existing);
        }
      }
      return Array.from(map.entries()).map(([name, providers]) => ({ name, providers }));
    },
    catch: (e) => new EngramError({ message: String(e) }),
  });
}
