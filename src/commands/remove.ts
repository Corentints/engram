import { Console, Effect } from "effect";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { loadManifest, saveManifest } from "../manifest.js";
import { ALL_PROVIDERS, globalSkillsDir, parseProvider, projectSkillsDir } from "../providers/index.js";
import { EngramError } from "../errors.js";

export const run = (
  ref: string,
  scope: string,
  keepFiles: boolean,
): Effect.Effect<void, EngramError> =>
  Effect.gen(function* () {
    if (scope === "project") {
      yield* removeProject(ref, keepFiles);
    } else {
      yield* removeGlobal(ref);
    }
  });

/** Project removal: `ref` is the manifest id (`source/skill`). */
function removeProject(ref: string, keepFiles: boolean): Effect.Effect<void, EngramError> {
  return Effect.gen(function* () {
    const cwd = process.cwd();
    const manifest = yield* loadManifest(cwd);
    const entry = manifest.skills[ref];
    if (!entry) {
      return yield* Effect.fail(new EngramError({ message: `skill '${ref}' not found in manifest` }));
    }

    if (!keepFiles) {
      for (const providerName of entry.providers ?? []) {
        const provider = yield* parseProvider(providerName);
        const dest = path.join(projectSkillsDir(provider, cwd), entry.skill);
        yield* removeIfExists(dest, providerName);
      }
    }

    manifest.skills = Object.fromEntries(Object.entries(manifest.skills).filter(([k]) => k !== ref));
    yield* saveManifest(cwd, manifest);
    yield* Console.log(`✓ Removed '${ref}' from manifest`);
  });
}

/** Global removal: `ref` is the skill path as shown by `engram list`. */
function removeGlobal(skillPath: string): Effect.Effect<void, EngramError> {
  return Effect.gen(function* () {
    let removed = false;
    for (const provider of ALL_PROVIDERS) {
      const dest = path.join(globalSkillsDir(provider), skillPath);
      const did = yield* removeIfExists(dest, provider);
      removed = removed || did;
    }
    if (!removed) {
      yield* Console.log(`No installed skill '${skillPath}' found.`);
    }
  });
}

function removeIfExists(dest: string, label: string): Effect.Effect<boolean, EngramError> {
  return Effect.gen(function* () {
    const exists = yield* Effect.tryPromise({
      try: () => fs.access(dest).then(() => true).catch(() => false),
      catch: (e) => new EngramError({ message: String(e) }),
    });
    if (!exists) return false;
    yield* Effect.tryPromise({
      try: () => fs.rm(dest, { recursive: true, force: true }),
      catch: (e) => new EngramError({ message: `removing ${dest}: ${String(e)}` }),
    });
    yield* Console.log(`✓ Removed ${label} at ${dest}`);
    return true;
  });
}
