import { Console, Effect } from "effect";
import { groupMultiselect, multiselect, isCancel } from "@clack/prompts";
import { styleText } from "node:util";
import { type RemoteSkill } from "./search.js";
import { loadConfig, saveConfig } from "../config.js";
import { ALL_PROVIDERS } from "../providers/index.js";
import { EngramError } from "../errors.js";
import { listRemoteSkills } from "./search.js";
import { run as installRun } from "./install.js";

export function resolveUrl(urlOrShorthand: string): string {
  if (urlOrShorthand.startsWith("http") || urlOrShorthand.startsWith("git@") || urlOrShorthand.startsWith("file://")) {
    return urlOrShorthand;
  }
  return `https://github.com/${urlOrShorthand}`;
}

export function deriveRegistryName(url: string): string {
  const github = url.match(/github\.com[:/]([^/]+)\/([^/\\.]+)/i);
  if (github?.[1] && github[2]) return `${github[1].toLowerCase()}/${github[2].toLowerCase()}`;
  return url.split("/").filter(Boolean).pop()?.replace(/\.git$/, "") ?? url;
}

export const add = (urlOrShorthand: string, registryPath: string) =>
  Effect.gen(function* () {
    const url = resolveUrl(urlOrShorthand);
    const name = deriveRegistryName(url);
    const config = yield* loadConfig();
    const existed = name in config.registries;
    config.registries[name] = { url, path: registryPath };
    yield* saveConfig(config);
    yield* existed
      ? Console.log(`~ Updated registry '${name}'`)
      : Console.log(`✓ Added registry '${name}' (${url})`);

    yield* Console.log(`Fetching available skills...`);
    const skills = yield* listRemoteSkills(url, registryPath);

    if (skills.length === 0) {
      yield* Console.log(`No skills found in this registry.`);
      return;
    }

    const selectedSkills = yield* Effect.tryPromise({
      try: async () => {
        const hasGroups = skills.some((s) => s.path.includes("/"));
        const skillsHint = styleText("dim", "↑↓ navigate  ·  space toggle   ·  enter confirm");
        const result = hasGroups
          ? await groupMultiselect<string>({
              message: `Select skills to install\n  ${skillsHint}`,
              options: buildGroupedOptions(skills),
              required: false,
            })
          : await multiselect<string>({
              message: `Select skills to install\n  ${skillsHint}`,
              options: skills.map((s) => ({ value: s.path, label: s.path, ...(s.description !== undefined && { hint: s.description }) })),
              required: false,
            });
        if (isCancel(result)) return [];
        return result;
      },
      catch: (e) => new EngramError({ message: String(e) }),
    });

    if (selectedSkills.length === 0) return;

    const selectedProviders = yield* Effect.tryPromise({
      try: async () => {
        const result = await multiselect<string>({
          message: "Select providers to install for",
          options: ALL_PROVIDERS.map((p) => ({ value: p, label: p })),
          required: true,
        });
        if (isCancel(result)) throw new Error("cancelled");
        return result;
      },
      catch: (e) => new EngramError({ message: String(e) }),
    });

    for (const skill of selectedSkills) {
      yield* installRun({
        skillRef: `${name}/${skill}`,
        providers: selectedProviders,
        scope: "global",
        branch: undefined,
      });
    }
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

type ClackOption = { value: string; label: string; hint?: string };

function truncate(text: string, max = 55): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function buildGroupedOptions(skills: RemoteSkill[]): Record<string, ClackOption[]> {
  const rootSkills = skills.filter((s) => !s.path.includes("/"));
  const nestedSkills = skills.filter((s) => s.path.includes("/"));

  const groups = new Map<string, RemoteSkill[]>();
  for (const skill of nestedSkills) {
    const slash = skill.path.indexOf("/");
    const group = skill.path.slice(0, slash);
    const existing = groups.get(group) ?? [];
    existing.push(skill);
    groups.set(group, existing);
  }

  const result: Record<string, ClackOption[]> = {};

  if (rootSkills.length > 0) {
    result["standalone"] = rootSkills.map((s) => ({
      value: s.path,
      label: s.path,
      ...(s.description !== undefined && { hint: truncate(s.description) }),
    }));
  }

  for (const [group, groupSkills] of groups) {
    result[group] = groupSkills.map((s) => {
      const subPath = s.path.slice(group.length + 1);
      return {
        value: s.path,
        label: subPath,
        ...(s.description !== undefined && { hint: truncate(s.description) }),
      };
    });
  }

  return result;
}
