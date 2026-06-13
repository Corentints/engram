import { describe, it, expect } from "vitest";
import { detectSkillRoot, extractSkillPaths } from "../src/commands/search.js";

describe("extractSkillPaths", () => {
  it("returns directories that contain a SKILL.md", () => {
    const files = [
      "skills/git/SKILL.md",
      "skills/git/.claude/rules.md",
      "skills/js/SKILL.md",
      "docs/README.md",
      "src/main.ts",
    ];
    expect(extractSkillPaths(files)).toEqual(["skills/git", "skills/js"]);
  });

  it("excludes directories with unrelated markdown files", () => {
    const files = [
      ".claude/rules.md",
      "docs/contributing/README.md",
      "src/commands/search.md",
      "skills/git/SKILL.md",
    ];
    expect(extractSkillPaths(files)).toEqual(["skills/git"]);
  });

  it("falls back to legacy skill format where the markdown file matches the directory name", () => {
    const files = [
      "legacy/git/git.md",
      "legacy/js/js.md",
      "src/main.ts",
    ];
    expect(extractSkillPaths(files)).toEqual(["legacy/git", "legacy/js"]);
  });

  it("ignores directories without markdown", () => {
    const files = [
      ".github/workflows/ci.yml",
      "src/commands/add.ts",
      "tests/fixtures/dotnet/Program.cs",
    ];
    expect(extractSkillPaths(files)).toEqual([]);
  });

  it("keeps the top-level skill dir when a nested dir also has a .md", () => {
    const files = [
      "skills/python/SKILL.md",
      "skills/python/examples/advanced/SKILL.md",
    ];
    expect(extractSkillPaths(files)).toEqual(["skills/python"]);
  });

  it("does not treat a markdown file at repo root as a skill", () => {
    const files = ["README.md", "SKILL.md", "src/main.ts"];
    expect(extractSkillPaths(files)).toEqual([]);
  });
});

describe("detectSkillRoot", () => {
  it("detects a common wrapping directory", () => {
    expect(detectSkillRoot(["skills/git", "skills/js", "skills/python"])).toBe("skills");
  });

  it("returns undefined when there is no common wrapper", () => {
    expect(detectSkillRoot(["rtk-light/git", "skills/js"])).toBeUndefined();
  });

  it("returns undefined for a single skill", () => {
    expect(detectSkillRoot(["git"])).toBeUndefined();
  });

  it("returns undefined for an empty list", () => {
    expect(detectSkillRoot([])).toBeUndefined();
  });
});
