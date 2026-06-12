import { Console, Effect } from "effect";
import { multiselect, isCancel } from "@clack/prompts";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadConfig, type RegistryEntry } from "../config.js";
import { loadManifest, saveManifest } from "../manifest.js";
import { ALL_PROVIDERS, globalSkillsDir, parseProvider, projectSkillsDir, type Provider } from "../providers/index.js";
import { copyDir, linkSkill, resolveRemoteSha, sparseCheckout, storeDir } from "../git.js";
import { EngramError } from "../errors.js";

export interface InstallArgs {
  skillRef: string
  providers: string[]
  scope: string
  branch: string | undefined
  /** Pin to an exact commit (e.g. from a manifest lockfile) instead of resolving the branch tip. */
  sha?: string | undefined
}

export const run = (args: InstallArgs) =>
  Effect.gen(function* () {
    const branch = args.branch ?? "main";
    const config = yield* loadConfig();
    const [registryName, skillRelPath] = yield* parseSkillRef(args.skillRef, config.registries);

    const registry = config.registries[registryName];
    if (!registry) {
      return yield* Effect.fail(
        new EngramError({ message: `registry '${registryName}' not configured. Run \`engram registry add\` first.` }),
      );
    }

    const providers = yield* resolveProviders(args.providers);
    const scope = resolveScope(args.scope);

    yield* Console.log(`Resolving ${args.skillRef} from ${registry.url}...`);
    const sha = args.sha ?? (yield* resolveRemoteSha(registry.url, branch));

    const repoSkillPath =
      registry.path === "." ? skillRelPath : `${registry.path.replace(/\/$/, "")}/${skillRelPath}`;

    const safeName = `${registryName}-${skillRelPath}`.replace(/\//g, "-");
    const tmpDir = path.join(os.tmpdir(), "engram", safeName);
    yield* Console.log(`Fetching skill (sparse checkout @ ${sha.slice(0, 12)})...`);
    yield* sparseCheckout(registry.url, repoSkillPath, sha, tmpDir);

    const skillSrc = path.join(tmpDir, repoSkillPath);
    const exists = yield* Effect.tryPromise({
      try: () => fs.access(skillSrc).then(() => true).catch(() => false),
      catch: (e) => new EngramError({ message: String(e) }),
    });
    if (!exists) {
      return yield* Effect.fail(
        new EngramError({ message: `skill path '${repoSkillPath}' not found in repository` }),
      );
    }

    // Materialize a single canonical copy in the store, then symlink it into each provider dir.
    const canonical = path.join(storeDir(), safeName);
    yield* Effect.tryPromise({
      try: () => fs.rm(canonical, { recursive: true, force: true }),
      catch: (e) => new EngramError({ message: String(e) }),
    });
    yield* copyDir(skillSrc, canonical);
    yield* Effect.promise(() => fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {}));

    for (const provider of providers) {
      const dest =
        scope === "global"
          ? path.join(globalSkillsDir(provider), skillRelPath)
          : path.join(projectSkillsDir(provider, process.cwd()), skillRelPath);

      yield* linkSkill(canonical, dest);
      yield* Console.log(`✓ Linked for ${provider} at ${dest}`);
    }

    if (scope === "project") {
      const cwd = process.cwd();
      const manifest = yield* loadManifest(cwd);
      const skillEntry: import("../manifest.js").SkillEntry = { providers, sha };
      if (branch !== "main") skillEntry.branch = branch;
      manifest.skills[args.skillRef] = skillEntry;
      yield* saveManifest(cwd, manifest);
    }
  });

export function parseSkillRef(
  skillRef: string,
  registries: Record<string, RegistryEntry>,
): Effect.Effect<[string, string], EngramError> {
  const sortedNames = Object.keys(registries).sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    if (skillRef.startsWith(name + "/")) {
      const skillRelPath = skillRef.slice(name.length + 1);
      if (skillRelPath) return Effect.succeed([name, skillRelPath]);
    }
  }
  return Effect.fail(
    new EngramError({
      message: `unknown registry in '${skillRef}' — run \`engram registry add\` first`,
    }),
  );
}

function resolveProviders(raw: string[]): Effect.Effect<Provider[], EngramError> {
  if (raw.length > 0) {
    return Effect.forEach(raw, parseProvider);
  }
  return Effect.tryPromise({
    try: async () => {
      const result = await multiselect<Provider>({
        message: "Select providers to install for",
        options: ALL_PROVIDERS.map((p) => ({ value: p, label: p })),
        required: true,
      });
      if (isCancel(result)) throw new Error("cancelled");
      return result;
    },
    catch: (e) => new EngramError({ message: String(e) }),
  });
}

function resolveScope(scope: string): "global" | "project" {
  return scope === "project" ? "project" : "global";
}
