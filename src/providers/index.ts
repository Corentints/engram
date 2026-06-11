import * as os from "node:os";
import { Effect } from "effect";
import { EngramError } from "../errors.js";
import { claude } from "./claude.js";
import { copilot } from "./copilot.js";

export type Provider = "claude" | "copilot";

export interface ProviderDef {
  readonly id: Provider;
  globalSkillsDir(home: string): string;
  projectSkillsDir(root: string): string;
}

const REGISTRY: Record<Provider, ProviderDef> = { claude, copilot };

export const ALL_PROVIDERS = Object.keys(REGISTRY) as Provider[];

export const parseProvider = (s: string): Effect.Effect<Provider, EngramError> => {
  const lower = s.toLowerCase();
  if (lower in REGISTRY) return Effect.succeed(lower as Provider);
  return Effect.fail(
    new EngramError({ message: `unknown provider '${s}' (supported: ${ALL_PROVIDERS.join(", ")})` }),
  );
};

export const globalSkillsDir = (provider: Provider): string =>
  REGISTRY[provider].globalSkillsDir(os.homedir());

export const projectSkillsDir = (provider: Provider, root: string): string =>
  REGISTRY[provider].projectSkillsDir(root);
