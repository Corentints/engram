import { Console, Effect } from "effect";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { loadConfig } from "../config.js";
import { loadManifest, saveManifest } from "../manifest.js";
import { globalSkillsDir, parseProvider, projectSkillsDir } from "../providers/index.js";
import { EngramError } from "../errors.js";
import { parseSkillRef } from "./install.js";

export const run = (
  skillRef: string,
  scope: string,
  keepFiles: boolean,
): Effect.Effect<void, EngramError> =>
  Effect.gen(function* () {
    const config = yield* loadConfig();
    const [, skillRelPath] = yield* parseSkillRef(skillRef, config.registries);

    if (!keepFiles) {
      if (scope === "global") {
        yield* removeGlobalFiles(skillRelPath);
      } else {
        yield* removeProjectFiles(skillRef, skillRelPath);
      }
    }

    if (scope === "project") {
      const cwd = process.cwd();
      const manifest = yield* loadManifest(cwd);
      if (!(skillRef in manifest.skills)) {
        return yield* Effect.fail(
          new EngramError({ message: `skill '${skillRef}' not found in manifest` }),
        );
      }
      manifest.skills = Object.fromEntries(Object.entries(manifest.skills).filter(([k]) => k !== skillRef));
      yield* saveManifest(cwd, manifest);
      yield* Console.log(`✓ Removed '${skillRef}' from manifest`);
    }
  });

function removeGlobalFiles(skillRelPath: string): Effect.Effect<void, EngramError> {
  return Effect.gen(function* () {
    for (const providerName of ["claude", "copilot"] as const) {
      const provider = yield* parseProvider(providerName);
      const dest = path.join(globalSkillsDir(provider), skillRelPath);
      const exists = yield* Effect.tryPromise({
        try: () => fs.access(dest).then(() => true).catch(() => false),
        catch: (e) => new EngramError({ message: String(e) }),
      });
      if (exists) {
        yield* Effect.tryPromise({
          try: () => fs.rm(dest, { recursive: true, force: true }),
          catch: (e) => new EngramError({ message: `removing ${dest}: ${String(e)}` }),
        });
        yield* Console.log(`✓ Removed ${providerName} at ${dest}`);
      }
    }
  });
}

function removeProjectFiles(skillRef: string, skillRelPath: string): Effect.Effect<void, EngramError> {
  return Effect.gen(function* () {
    const cwd = process.cwd();
    const manifest = yield* loadManifest(cwd);
    const entry = manifest.skills[skillRef];
    if (!entry) {
      return yield* Effect.fail(
        new EngramError({ message: `skill '${skillRef}' not found in manifest` }),
      );
    }
    for (const providerName of entry.providers ?? []) {
      const provider = yield* parseProvider(providerName);
      const dest = path.join(projectSkillsDir(provider, cwd), skillRelPath);
      const exists = yield* Effect.tryPromise({
        try: () => fs.access(dest).then(() => true).catch(() => false),
        catch: (e) => new EngramError({ message: String(e) }),
      });
      if (exists) {
        yield* Effect.tryPromise({
          try: () => fs.rm(dest, { recursive: true, force: true }),
          catch: (e) => new EngramError({ message: `removing ${dest}: ${String(e)}` }),
        });
        yield* Console.log(`✓ Removed ${providerName} at ${dest}`);
      }
    }
  });
}
