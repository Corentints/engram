import { Effect } from "effect";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { EngramError } from "./errors.js";

export const MANIFEST_FILE = "skills.json";

export interface SkillEntry {
  /** Git source the skill comes from: `owner/repo` shorthand or a full git URL. */
  source: string
  /** Skill path within the source (relative to `path`). */
  skill: string
  /** Commit the skill is pinned to, for reproducible `sync`. */
  sha?: string
  /** Branch the SHA was resolved from (omitted when it is the default `main`). */
  branch?: string
  /** Sub-directory of the repo that holds skills (omitted when it is the repo root `.`). */
  path?: string
  providers?: string[]
}

export interface Manifest {
  skills: Record<string, SkillEntry>
}

export const loadManifest = (dir: string): Effect.Effect<Manifest, EngramError> =>
  Effect.tryPromise({
    try: async () => {
      const p = path.join(dir, MANIFEST_FILE);
      try {
        const raw = await fs.readFile(p, "utf-8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const rawSkills = (parsed["skills"] ?? {}) as Record<string, Record<string, unknown>>;
        const skills: Record<string, SkillEntry> = {};
        for (const [k, v] of Object.entries(rawSkills)) {
          const entry: SkillEntry = {
            source: typeof v["source"] === "string" ? v["source"] : "",
            skill: typeof v["skill"] === "string" ? v["skill"] : "",
          };
          const sha = v["sha"];
          if (typeof sha === "string") entry.sha = sha;
          const branch = v["branch"];
          if (typeof branch === "string") entry.branch = branch;
          const skillPath = v["path"];
          if (typeof skillPath === "string") entry.path = skillPath;
          const providers = v["providers"];
          if (Array.isArray(providers)) entry.providers = providers as string[];
          skills[k] = entry;
        }
        return { skills };
      } catch (e: unknown) {
        if (isNodeError(e) && e.code === "ENOENT") return { skills: {} };
        throw e;
      }
    },
    catch: (e) => new EngramError({ message: String(e) }),
  });

export const saveManifest = (dir: string, manifest: Manifest): Effect.Effect<void, EngramError> =>
  Effect.tryPromise({
    try: async () => {
      const p = path.join(dir, MANIFEST_FILE);
      const data: Record<string, unknown> = { skills: {} };
      const skillsOut = data["skills"] as Record<string, Record<string, unknown>>;
      for (const [k, v] of Object.entries(manifest.skills)) {
        const entry: Record<string, unknown> = { source: v.source, skill: v.skill };
        if (v.sha !== undefined) entry["sha"] = v.sha;
        if (v.branch !== undefined) entry["branch"] = v.branch;
        if (v.path !== undefined) entry["path"] = v.path;
        if (v.providers !== undefined) entry["providers"] = v.providers;
        skillsOut[k] = entry;
      }
      await fs.writeFile(p, JSON.stringify(data, null, 2));
    },
    catch: (e) => new EngramError({ message: String(e) }),
  });

function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && "code" in e;
}
