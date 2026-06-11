import { Console, Effect } from "effect";
import { checkbox } from "@inquirer/prompts";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadConfig } from "../config.js";
import { loadManifest, saveManifest } from "../manifest.js";
import { ALL_PROVIDERS, globalSkillsDir, parseProvider, projectSkillsDir, type Provider } from "../providers.js";
import { copyDir, resolveRemoteSha, sparseCheckout } from "../git.js";
import { EngramError } from "../errors.js";

export interface InstallArgs {
  skillRef: string
  providers: string[]
  scope: string
  branch: string | undefined
}

export const run = (args: InstallArgs): Effect.Effect<void, EngramError> =>
  Effect.gen(function* () {
    const [registryName, skillName] = yield* parseSkillRef(args.skillRef);
    const branch = args.branch ?? "main";

    const config = yield* loadConfig();
    const registry = config.registries[registryName];
    if (!registry) {
      return yield* Effect.fail(
        new EngramError({
          message: `registry '${registryName}' not configured. Run \`engram registry add\` first.`,
        }),
      );
    }

    const providers = yield* resolveProviders(args.providers);
    const scope = resolveScope(args.scope);

    yield* Console.log(`Resolving ${args.skillRef} from ${registry.url}...`);
    const sha = yield* resolveRemoteSha(registry.url, branch);

    const skillPath =
      registry.path === "." ? skillName : `${registry.path.replace(/\/$/, "")}/${skillName}`;

    const tmpDir = path.join(os.tmpdir(), "engram", `${registryName}-${skillName}`);
    yield* Console.log(`Fetching skill (sparse checkout)...`);
    yield* sparseCheckout(registry.url, skillPath, sha, tmpDir);

    const skillSrc = path.join(tmpDir, skillPath);
    const exists = yield* Effect.tryPromise({
      try: () => fs.access(skillSrc).then(() => true).catch(() => false),
      catch: (e) => new EngramError({ message: String(e) }),
    });
    if (!exists) {
      return yield* Effect.fail(
        new EngramError({ message: `skill path '${skillPath}' not found in repository` }),
      );
    }

    for (const provider of providers) {
      const dest =
        scope === "global"
          ? path.join(globalSkillsDir(provider), skillName)
          : path.join(projectSkillsDir(provider, process.cwd()), skillName);

      const destExists = yield* Effect.tryPromise({
        try: () => fs.access(dest).then(() => true).catch(() => false),
        catch: (e) => new EngramError({ message: String(e) }),
      });
      if (destExists) {
        yield* Console.log(`! ${provider} already exists at ${dest} — overwriting`);
        yield* Effect.tryPromise({
          try: () => fs.rm(dest, { recursive: true, force: true }),
          catch: (e) => new EngramError({ message: String(e) }),
        });
      }

      yield* copyDir(skillSrc, dest);
      yield* Console.log(`✓ Installed for ${provider} at ${dest}`);
    }

    yield* Effect.tryPromise({
      try: () => fs.rm(tmpDir, { recursive: true, force: true }),
      catch: () => undefined as never,
    });

    if (scope === "project") {
      const cwd = process.cwd();
      const manifest = yield* loadManifest(cwd);
      const skillEntry: import("../manifest.js").SkillEntry = { providers };
      if (branch !== "main") skillEntry.branch = branch;
      manifest.skills[`${registryName}/${skillName}`] = skillEntry;
      yield* saveManifest(cwd, manifest);
    }
  });

function parseSkillRef(skillRef: string): Effect.Effect<[string, string], EngramError> {
  const parts = skillRef.split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return Effect.fail(
      new EngramError({
        message: `invalid skill reference '${skillRef}' — expected format: registry/skill`,
      }),
    );
  }
  return Effect.succeed([parts[0], parts[1]]);
}

function resolveProviders(raw: string[]): Effect.Effect<Provider[], EngramError> {
  if (raw.length > 0) {
    return Effect.forEach(raw, parseProvider);
  }
  return Effect.tryPromise({
    try: async () => {
      const selected = await checkbox<Provider>({
        message: "Select providers to install for",
        choices: ALL_PROVIDERS.map((p) => ({ name: p, value: p })),
      });
      if (selected.length === 0) throw new Error("no providers selected");
      return selected;
    },
    catch: (e) => new EngramError({ message: String(e) }),
  });
}

function resolveScope(scope: string): "global" | "project" {
  return scope === "project" ? "project" : "global";
}
