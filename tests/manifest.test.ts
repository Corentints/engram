import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Effect } from "effect";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadManifest, saveManifest, MANIFEST_FILE } from "../src/manifest.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "engram-test-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);

describe("loadManifest", () => {
  it("returns empty skills when file does not exist", async () => {
    const manifest = await run(loadManifest(tmp));
    expect(manifest).toEqual({ skills: {} });
  });

  it("parses a full skill entry", async () => {
    const data = {
      skills: {
        "owner/repo/my-skill": {
          source: "owner/repo",
          skill: "my-skill",
          sha: "abc123",
          branch: "main",
          path: "skills",
          providers: ["claude", "copilot"],
        },
      },
    };
    await fs.writeFile(path.join(tmp, MANIFEST_FILE), JSON.stringify(data));

    const manifest = await run(loadManifest(tmp));
    expect(manifest.skills["owner/repo/my-skill"]).toEqual({
      source: "owner/repo",
      skill: "my-skill",
      sha: "abc123",
      branch: "main",
      path: "skills",
      providers: ["claude", "copilot"],
    });
  });

  it("parses a minimal skill entry (source + skill only)", async () => {
    const data = { skills: { "o/r/bare": { source: "o/r", skill: "bare" } } };
    await fs.writeFile(path.join(tmp, MANIFEST_FILE), JSON.stringify(data));

    const manifest = await run(loadManifest(tmp));
    expect(manifest.skills["o/r/bare"]).toEqual({ source: "o/r", skill: "bare" });
  });

  it("ignores invalid branch type", async () => {
    const data = { skills: { s: { source: "o/r", skill: "s", branch: 42 } } };
    await fs.writeFile(path.join(tmp, MANIFEST_FILE), JSON.stringify(data));

    const manifest = await run(loadManifest(tmp));
    expect(manifest.skills["s"]?.branch).toBeUndefined();
  });

  it("fails on malformed JSON", async () => {
    await fs.writeFile(path.join(tmp, MANIFEST_FILE), "not json");
    await expect(run(loadManifest(tmp))).rejects.toThrow();
  });
});

describe("saveManifest / loadManifest roundtrip", () => {
  it("persists and restores a manifest", async () => {
    const original = {
      skills: {
        "o/r/foo": { source: "o/r", skill: "foo", branch: "dev", providers: ["claude"] },
        "o/r/bar": { source: "o/r", skill: "bar" },
      },
    };

    await run(saveManifest(tmp, original));
    const loaded = await run(loadManifest(tmp));

    expect(loaded).toEqual(original);
  });

  it("omits undefined optional fields from JSON output", async () => {
    await run(saveManifest(tmp, { skills: { s: { source: "o/r", skill: "s" } } }));
    const raw = JSON.parse(await fs.readFile(path.join(tmp, MANIFEST_FILE), "utf-8")) as { skills: Record<string, Record<string, unknown>> };
    expect(Object.keys(raw.skills["s"] ?? {}).sort()).toEqual(["skill", "source"]);
  });
});
