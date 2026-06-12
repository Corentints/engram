import { Console, Effect } from "effect";
import { multiselect, isCancel } from "@clack/prompts";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadManifest, saveManifest, type SkillEntry } from "../manifest.js";
import { ALL_PROVIDERS, globalSkillsDir, parseProvider, projectSkillsDir, type Provider } from "../providers/index.js";
import { copyDir, linkSkill, resolveRemoteSha, sparseCheckout, storeDir } from "../git.js";
import { resolveUrl, skillId, storeKey } from "../source.js";
import { EngramError } from "../errors.js";

export type Scope = "global" | "project";

export interface InstallSkillOptions {
  source: string
  skill: string
  providers: Provider[]
  scope: Scope
  branch: string
  path: string
  /** Pin to an exact commit instead of resolving the branch tip. */
  sha?: string | undefined
}

/** Fetch a single skill from a source and link it into each provider directory. */
export const installSkill = (opts: InstallSkillOptions) =>
  Effect.gen(function* () {
    const url = resolveUrl(opts.source);
    const sha = opts.sha ?? (yield* resolveRemoteSha(url, opts.branch));

    const base = opts.path.replace(/\/$/, "");
    const repoSkillPath = base === "." || base === "" ? opts.skill : `${base}/${opts.skill}`;

    const safeName = storeKey(opts.source, opts.skill);
    const tmpDir = path.join(os.tmpdir(), "engram", safeName);
    yield* Console.log(`Fetching ${skillId(opts.source, opts.skill)} @ ${sha.slice(0, 12)}...`);
    yield* sparseCheckout(url, repoSkillPath, sha, tmpDir);

    const skillSrc = path.join(tmpDir, repoSkillPath);
    const exists = yield* Effect.tryPromise({
      try: () => fs.access(skillSrc).then(() => true).catch(() => false),
      catch: (e) => new EngramError({ message: String(e) }),
    });
    if (!exists) {
      return yield* Effect.fail(
        new EngramError({ message: `skill path '${repoSkillPath}' not found in ${opts.source}` }),
      );
    }

    // Materialize a single canonical copy, then symlink it into each provider dir.
    const canonical = path.join(storeDir(), safeName);
    yield* Effect.tryPromise({
      try: () => fs.rm(canonical, { recursive: true, force: true }),
      catch: (e) => new EngramError({ message: String(e) }),
    });
    yield* copyDir(skillSrc, canonical);
    yield* Effect.promise(() => fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {}));

    for (const provider of opts.providers) {
      const dest =
        opts.scope === "global"
          ? path.join(globalSkillsDir(provider), opts.skill)
          : path.join(projectSkillsDir(provider, process.cwd()), opts.skill);

      yield* linkSkill(canonical, dest);
      yield* Console.log(`✓ Linked for ${provider} at ${dest}`);
    }

    if (opts.scope === "project") {
      const cwd = process.cwd();
      const manifest = yield* loadManifest(cwd);
      const entry: SkillEntry = { source: opts.source, skill: opts.skill, sha, providers: opts.providers };
      if (opts.branch !== "main") entry.branch = opts.branch;
      if (base !== "." && base !== "") entry.path = base;
      manifest.skills[skillId(opts.source, opts.skill)] = entry;
      yield* saveManifest(cwd, manifest);
    }
  });

export interface InstallManyOptions {
  source: string
  skills: string[]
  providers: Provider[]
  scope: Scope
  branch: string
  path: string
}

/** Install several skills from one source, resolving the commit once for a consistent snapshot. */
export const installSkills = (opts: InstallManyOptions) =>
  Effect.gen(function* () {
    const url = resolveUrl(opts.source);
    const sha = yield* resolveRemoteSha(url, opts.branch);
    for (const skill of opts.skills) {
      yield* installSkill({ ...opts, skill, sha });
    }
  });

export const resolveScope = (scope: string): Scope => (scope === "project" ? "project" : "global");

export function resolveProviders(raw: string[]): Effect.Effect<Provider[], EngramError> {
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

export const parseProviderList = (raw: string): string[] =>
  raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];

/** CLI entry for `engram install <source> <skill>`: a direct, non-interactive single install. */
export const runInstall = (
  source: string,
  skill: string,
  providerRaw: string,
  scope: string,
  branch: string | undefined,
  subPath: string,
) =>
  Effect.gen(function* () {
    const providers = yield* resolveProviders(parseProviderList(providerRaw));
    yield* installSkill({
      source,
      skill,
      providers,
      scope: resolveScope(scope),
      branch: branch ?? "main",
      path: subPath,
    });
  });
