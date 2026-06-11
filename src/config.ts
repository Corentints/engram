import { Effect } from "effect"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"
import { EngramError } from "./errors.js"

export interface RegistryEntry {
  url: string
  path: string
}

export interface Config {
  registries: Record<string, RegistryEntry>
}

export function configFilePath(): string {
  const base = process.env["XDG_CONFIG_HOME"] ?? path.join(os.homedir(), ".config")
  return path.join(base, "engram", "config.json")
}

export const loadConfig = (): Effect.Effect<Config, EngramError> =>
  Effect.tryPromise({
    try: async () => {
      const p = configFilePath()
      try {
        const raw = await fs.readFile(p, "utf-8")
        const parsed = JSON.parse(raw) as Record<string, unknown>
        const rawRegistries = (parsed["registries"] ?? {}) as Record<string, Record<string, string>>
        const registries: Record<string, RegistryEntry> = {}
        for (const [k, v] of Object.entries(rawRegistries)) {
          registries[k] = { url: v["url"] ?? "", path: v["path"] ?? "." }
        }
        return { registries }
      } catch (e: unknown) {
        if (isNodeError(e) && e.code === "ENOENT") return { registries: {} }
        throw e
      }
    },
    catch: (e) => new EngramError({ message: String(e) }),
  })

export const saveConfig = (config: Config): Effect.Effect<void, EngramError> =>
  Effect.tryPromise({
    try: async () => {
      const p = configFilePath()
      await fs.mkdir(path.dirname(p), { recursive: true })
      await fs.writeFile(p, JSON.stringify({ registries: config.registries }, null, 2))
    },
    catch: (e) => new EngramError({ message: String(e) }),
  })

function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && "code" in e
}
