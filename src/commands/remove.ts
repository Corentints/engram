import { Console, Effect } from "effect"
import * as fs from "node:fs/promises"
import { loadManifest, saveManifest } from "../manifest.js"
import { globalSkillsDir, parseProvider, projectSkillsDir } from "../providers.js"
import { EngramError } from "../errors.js"

export const run = (
  skillRef: string,
  scope: string,
  keepFiles: boolean,
): Effect.Effect<void, EngramError> =>
  Effect.gen(function* () {
    const skillName = skillRef.includes("/") ? skillRef.split("/")[1] ?? skillRef : skillRef

    if (!keepFiles) {
      if (scope === "global") {
        yield* removeGlobalFiles(skillName)
      } else {
        yield* removeProjectFiles(skillRef, skillName)
      }
    }

    if (scope === "project") {
      const cwd = process.cwd()
      const manifest = yield* loadManifest(cwd)
      if (!(skillRef in manifest.skills)) {
        return yield* Effect.fail(
          new EngramError({ message: `skill '${skillRef}' not found in manifest` }),
        )
      }
      manifest.skills = Object.fromEntries(Object.entries(manifest.skills).filter(([k]) => k !== skillRef))
      yield* saveManifest(cwd, manifest)
      yield* Console.log(`✓ Removed '${skillRef}' from manifest`)
    }
  })

function removeGlobalFiles(skillName: string): Effect.Effect<void, EngramError> {
  return Effect.gen(function* () {
    for (const providerName of ["claude", "copilot"] as const) {
      const provider = yield* parseProvider(providerName)
      const dest = globalSkillsDir(provider) + "/" + skillName
      const exists = yield* Effect.tryPromise({
        try: () => fs.access(dest).then(() => true).catch(() => false),
        catch: (e) => new EngramError({ message: String(e) }),
      })
      if (exists) {
        yield* Effect.tryPromise({
          try: () => fs.rm(dest, { recursive: true, force: true }),
          catch: (e) => new EngramError({ message: `removing ${dest}: ${String(e)}` }),
        })
        yield* Console.log(`✓ Removed ${providerName} at ${dest}`)
      }
    }
  })
}

function removeProjectFiles(skillRef: string, skillName: string): Effect.Effect<void, EngramError> {
  return Effect.gen(function* () {
    const cwd = process.cwd()
    const manifest = yield* loadManifest(cwd)
    const entry = manifest.skills[skillRef]
    if (!entry) {
      return yield* Effect.fail(
        new EngramError({ message: `skill '${skillRef}' not found in manifest` }),
      )
    }
    for (const providerName of entry.providers ?? []) {
      const provider = yield* parseProvider(providerName)
      const dest = projectSkillsDir(provider, cwd) + "/" + skillName
      const exists = yield* Effect.tryPromise({
        try: () => fs.access(dest).then(() => true).catch(() => false),
        catch: (e) => new EngramError({ message: String(e) }),
      })
      if (exists) {
        yield* Effect.tryPromise({
          try: () => fs.rm(dest, { recursive: true, force: true }),
          catch: (e) => new EngramError({ message: `removing ${dest}: ${String(e)}` }),
        })
        yield* Console.log(`✓ Removed ${providerName} at ${dest}`)
      }
    }
  })
}
