import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Effect } from "effect";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadManifest, saveManifest, MANIFEST_FILE } from "../manifest.js";

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
        "my-skill": { branch: "main", providers: ["claude", "copilot"] },
      },
    };
    await fs.writeFile(path.join(tmp, MANIFEST_FILE), JSON.stringify(data));

    const manifest = await run(loadManifest(tmp));
    expect(manifest.skills["my-skill"]).toEqual({ branch: "main", providers: ["claude", "copilot"] });
  });

  it("parses a skill entry with no branch or providers", async () => {
    const data = { skills: { bare: {} } };
    await fs.writeFile(path.join(tmp, MANIFEST_FILE), JSON.stringify(data));

    const manifest = await run(loadManifest(tmp));
    expect(manifest.skills["bare"]).toEqual({});
  });

  it("ignores invalid branch type", async () => {
    const data = { skills: { s: { branch: 42 } } };
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
        foo: { branch: "dev", providers: ["claude"] },
        bar: {},
      },
    };

    await run(saveManifest(tmp, original));
    const loaded = await run(loadManifest(tmp));

    expect(loaded).toEqual(original);
  });

  it("omits undefined fields from JSON output", async () => {
    await run(saveManifest(tmp, { skills: { s: {} } }));
    const raw = JSON.parse(await fs.readFile(path.join(tmp, MANIFEST_FILE), "utf-8")) as { skills: Record<string, Record<string, unknown>> };
    expect(Object.keys(raw.skills["s"] ?? {})).toHaveLength(0);
  });
});
