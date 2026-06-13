import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import * as path from "node:path";
import * as os from "node:os";
import { parseProvider, globalSkillsDir, projectSkillsDir } from "../src/providers/index.js";

const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
const runFail = <A, E>(effect: Effect.Effect<A, E>): Promise<E> =>
  Effect.runPromise(Effect.flip(effect));

describe("parseProvider", () => {
  it("accepts 'claude'", async () => {
    expect(await run(parseProvider("claude"))).toBe("claude");
  });

  it("accepts 'copilot'", async () => {
    expect(await run(parseProvider("copilot"))).toBe("copilot");
  });

  it("is case-insensitive", async () => {
    expect(await run(parseProvider("Claude"))).toBe("claude");
    expect(await run(parseProvider("COPILOT"))).toBe("copilot");
  });

  it("fails on unknown provider", async () => {
    const err = await runFail(parseProvider("gpt"));
    expect(err.message).toContain("unknown provider");
  });
});

describe("globalSkillsDir", () => {
  it("returns ~/.claude/skills for claude", () => {
    expect(globalSkillsDir("claude")).toBe(path.join(os.homedir(), ".claude", "skills"));
  });

  it("returns ~/.agents/skills for copilot", () => {
    expect(globalSkillsDir("copilot")).toBe(path.join(os.homedir(), ".agents", "skills"));
  });
});

describe("projectSkillsDir", () => {
  it("returns .claude/skills for claude", () => {
    expect(projectSkillsDir("claude", "/repo")).toBe("/repo/.claude/skills");
  });

  it("returns .github/skills for copilot", () => {
    expect(projectSkillsDir("copilot", "/repo")).toBe("/repo/.github/skills");
  });
});
