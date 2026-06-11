import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Effect } from "effect";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadConfig, saveConfig } from "../config.js";

const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "engram-config-"));
  vi.stubEnv("XDG_CONFIG_HOME", tmp);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("returns empty registries when config file does not exist", async () => {
    const config = await run(loadConfig());
    expect(config).toEqual({ registries: {} });
  });

  it("parses registry entries", async () => {
    const dir = path.join(tmp, "engram");
    await fs.mkdir(dir, { recursive: true });
    const data = {
      registries: {
        main: { url: "https://github.com/foo/skills", path: "skills" },
      },
    };
    await fs.writeFile(path.join(dir, "config.json"), JSON.stringify(data));

    const config = await run(loadConfig());
    expect(config.registries["main"]).toEqual({ url: "https://github.com/foo/skills", path: "skills" });
  });
});

describe("saveConfig / loadConfig roundtrip", () => {
  it("persists and restores config", async () => {
    const original = {
      registries: {
        foo: { url: "https://github.com/org/repo", path: "." },
      },
    };

    await run(saveConfig(original));
    const loaded = await run(loadConfig());
    expect(loaded).toEqual(original);
  });
});
