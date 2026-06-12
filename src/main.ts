#!/usr/bin/env tsx
import { Args, Command, Options } from "@effect/cli";
// Import via subpaths so we don't pull @effect/platform-node's cluster barrel
// (NodeClusterHttp/Socket → @effect/cluster, @effect/rpc, @effect/sql), which we don't use.
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { Console, Effect, Option } from "effect";
import { EngramError } from "./errors.js";
import * as RegistryCmd from "./commands/registry.js";
import * as InstallCmd from "./commands/install.js";
import * as ListCmd from "./commands/list.js";
import * as RemoveCmd from "./commands/remove.js";
import * as SyncCmd from "./commands/sync.js";
import * as SearchCmd from "./commands/search.js";

// ── registry ──────────────────────────────────────────────────────────────────

const registryAddCmd = Command.make(
  "add",
  {
    url: Args.text({ name: "url" }),
    path: Options.withDefault(Options.text("path"), "."),
  },
  ({ url, path }) => wrap(RegistryCmd.add(url, path)),
);

// ── add (shorthand) ───────────────────────────────────────────────────────────

const addCmd = Command.make(
  "add",
  {
    ref: Args.text({ name: "owner/repo" }),
    path: Options.withDefault(Options.text("path"), "."),
  },
  ({ ref, path }) => wrap(RegistryCmd.add(ref, path)),
);

const registryListCmd = Command.make("list", {}, () => wrap(RegistryCmd.list()));

const registryRemoveCmd = Command.make(
  "remove",
  { name: Args.text({ name: "name" }) },
  ({ name }) => wrap(RegistryCmd.remove(name)),
);

const registryCmd = Command.make("registry", {}, () => Effect.void).pipe(
  Command.withSubcommands([registryAddCmd, registryListCmd, registryRemoveCmd]),
);

// ── install ───────────────────────────────────────────────────────────────────

const installCmd = Command.make(
  "install",
  {
    skillRef: Args.text({ name: "skill-ref" }),
    provider: Options.withDefault(Options.text("provider"), ""),
    scope: Options.withDefault(Options.text("scope"), "global"),
    branch: Options.optional(Options.text("branch")),
  },
  ({ skillRef, provider, scope, branch }) =>
    wrap(
      InstallCmd.run({
        skillRef,
        providers: provider ? provider.split(",").map((s) => s.trim()).filter(Boolean) : [],
        scope,
        branch: Option.getOrUndefined(branch),
      }),
    ),
);

// ── list ──────────────────────────────────────────────────────────────────────

const listCmd = Command.make(
  "list",
  { scope: Options.optional(Options.text("scope")) },
  ({ scope }) => wrap(ListCmd.run(Option.getOrUndefined(scope))),
);

// ── remove ────────────────────────────────────────────────────────────────────

const removeCmd = Command.make(
  "remove",
  {
    skillRef: Args.text({ name: "skill-ref" }),
    scope: Options.withDefault(Options.text("scope"), "global"),
    keepFiles: Options.boolean("keep-files"),
  },
  ({ skillRef, scope, keepFiles }) => wrap(RemoveCmd.run(skillRef, scope, keepFiles)),
);

// ── sync ──────────────────────────────────────────────────────────────────────

const syncCmd = Command.make(
  "sync",
  { dir: Options.optional(Options.text("dir")) },
  ({ dir }) => wrap(SyncCmd.run(Option.getOrUndefined(dir))),
);

// ── search ────────────────────────────────────────────────────────────────────

const searchCmd = Command.make(
  "search",
  {
    query: Args.text({ name: "query" }),
    registry: Options.optional(Options.text("registry")),
  },
  ({ query, registry }) => wrap(SearchCmd.run(query, Option.getOrUndefined(registry))),
);

// ── root ──────────────────────────────────────────────────────────────────────

const engramCmd = Command.make("engram", {}, () => Effect.void).pipe(
  Command.withSubcommands([
    addCmd,
    registryCmd,
    installCmd,
    listCmd,
    removeCmd,
    syncCmd,
    searchCmd,
  ]),
);

const cli = Command.run(engramCmd, { name: "engram", version: "0.1.0" });

Effect.suspend(() => cli(process.argv)).pipe(
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain,
);

// ── helpers ───────────────────────────────────────────────────────────────────

function wrap<R>(effect: Effect.Effect<void, EngramError, R>): Effect.Effect<void, never, R> {
  return effect.pipe(
    Effect.catchAll((e) =>
      Console.error(`error: ${e.message}`).pipe(
        Effect.flatMap(() => Effect.sync(() => process.exit(1))),
      ),
    ),
  );
}
