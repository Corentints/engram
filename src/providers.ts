import * as path from "node:path"
import * as os from "node:os"
import { Effect } from "effect"
import { EngramError } from "./errors.js"

export type Provider = "claude" | "copilot"

export const ALL_PROVIDERS: Provider[] = ["claude", "copilot"]

export const parseProvider = (s: string): Effect.Effect<Provider, EngramError> => {
  const lower = s.toLowerCase()
  if (lower === "claude" || lower === "copilot") return Effect.succeed(lower)
  return Effect.fail(new EngramError({ message: `unknown provider '${s}' (supported: claude, copilot)` }))
}

export const globalSkillsDir = (provider: Provider): string => {
  const home = os.homedir()
  switch (provider) {
    case "claude":
      return path.join(home, ".claude", "skills")
    case "copilot":
      return path.join(home, ".agents", "skills")
  }
}

export const projectSkillsDir = (provider: Provider, projectRoot: string): string => {
  switch (provider) {
    case "claude":
      return path.join(projectRoot, ".claude", "skills")
    case "copilot":
      return path.join(projectRoot, ".github", "skills")
  }
}
