#!/usr/bin/env tsx
import { Args, Command, Options } from "@effect/cli";
// Import via subpaths so we don't pull @effect/platform-node's cluster barrel
// (NodeClusterHttp/Socket → @effect/cluster, @effect/rpc, @effect/sql), which we don't use.
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { Console, Effect, Option } from "effect";
import { EngramError } from "./errors.js";
import * as AddCmd from "./commands/add.js";
import * as InstallCmd from "./commands/install.js";
import * as ListCmd from "./commands/list.js";
import * as RemoveCmd from "./commands/remove.js";
import * as SyncCmd from "./commands/sync.js";
import * as SearchCmd from "./commands/search.js";

// ── add ───────────────────────────────────────────────────────────────────────

const addCmd = Command.make(
  "add",
  {
    source: Args.text({ name: "owner/repo" }),
    skill: Options.withDefault(Options.text("skill"), ""),
    provider: Options.withDefault(Options.text("provider"), ""),
    scope: Options.withDefault(Options.text("scope"), "global"),
    branch: Options.optional(Options.text("branch")),
    path: Options.withDefault(Options.text("path"), "."),
  },
  ({ source, skill, provider, scope, branch, path }) =>
    wrap(
      AddCmd.run({
        source,
        skill,
        providers: InstallCmd.parseProviderList(provider),
        scope,
        branch: Option.getOrUndefined(branch),
        path,
      }),
    ),
);

// ── install (direct, non-interactive) ─────────────────────────────────────────

const installCmd = Command.make(
  "install",
  {
    source: Args.text({ name: "owner/repo" }),
    skill: Args.text({ name: "skill" }),
    provider: Options.withDefault(Options.text("provider"), ""),
    scope: Options.withDefault(Options.text("scope"), "global"),
    branch: Options.optional(Options.text("branch")),
    path: Options.withDefault(Options.text("path"), "."),
  },
  ({ source, skill, provider, scope, branch, path }) =>
    wrap(InstallCmd.runInstall(source, skill, provider, scope, Option.getOrUndefined(branch), path)),
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
    ref: Args.text({ name: "skill-ref" }),
    scope: Options.withDefault(Options.text("scope"), "global"),
    keepFiles: Options.boolean("keep-files"),
  },
  ({ ref, scope, keepFiles }) => wrap(RemoveCmd.run(ref, scope, keepFiles)),
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
    source: Args.text({ name: "owner/repo" }),
    query: Args.optional(Args.text({ name: "query" })),
    path: Options.withDefault(Options.text("path"), "."),
  },
  ({ source, query, path }) => wrap(SearchCmd.run(source, Option.getOrUndefined(query), path)),
);

// ── root ──────────────────────────────────────────────────────────────────────

const engramCmd = Command.make("engram", {}, () => Effect.void).pipe(
  Command.withSubcommands([addCmd, installCmd, listCmd, removeCmd, syncCmd, searchCmd]),
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
