import { Console, Effect } from "effect";
import { loadConfig, saveConfig } from "../config.js";
import { EngramError } from "../errors.js";

export const add = (name: string, url: string, registryPath: string): Effect.Effect<void, EngramError> =>
  Effect.gen(function* () {
    const config = yield* loadConfig();
    const existed = name in config.registries;
    config.registries[name] = { url, path: registryPath };
    yield* saveConfig(config);
    yield* existed
      ? Console.log(`~ Updated registry '${name}'`)
      : Console.log(`✓ Added registry '${name}' (${url})`);
  });

export const list = (): Effect.Effect<void, EngramError> =>
  Effect.gen(function* () {
    const config = yield* loadConfig();
    const entries = Object.entries(config.registries);
    if (entries.length === 0) {
      yield* Console.log("No registries configured. Use `engram registry add <name> <url>` to add one.");
      return;
    }
    for (const [name, entry] of entries) {
      const hint = entry.path !== "." ? ` (path: ${entry.path})` : "";
      yield* Console.log(`  ${name}  ${entry.url}${hint}`);
    }
  });

export const remove = (name: string): Effect.Effect<void, EngramError> =>
  Effect.gen(function* () {
    const config = yield* loadConfig();
    if (!(name in config.registries)) {
      return yield* Effect.fail(new EngramError({ message: `registry '${name}' not found` }));
    }
    config.registries = Object.fromEntries(Object.entries(config.registries).filter(([k]) => k !== name));
    yield* saveConfig(config);
    yield* Console.log(`✓ Removed registry '${name}'`);
  });
