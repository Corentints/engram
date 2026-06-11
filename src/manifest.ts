import { Effect } from "effect";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { EngramError } from "./errors.js";

export const MANIFEST_FILE = "engram.json";

export interface SkillEntry {
  branch?: string
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
          const entry: SkillEntry = {};
          const branch = v["branch"];
          if (typeof branch === "string") entry.branch = branch;
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
        const entry: Record<string, unknown> = {};
        if (v.branch !== undefined) entry["branch"] = v.branch;
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
