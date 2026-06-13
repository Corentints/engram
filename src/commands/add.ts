import { Console, Effect } from "effect";
import { groupMultiselect, multiselect, isCancel } from "@clack/prompts";
import { styleText } from "node:util";
import { resolveUrl } from "../source.js";
import { EngramError } from "../errors.js";
import { listRemoteSkills, type RemoteSkill } from "./search.js";
import { installSkills, splitCsv, resolveProviders, resolveScope } from "./install.js";

export interface AddArgs {
  source: string
  /** Comma-separated skills. Empty → interactive selection (unless `all`). */
  skill: string
  /** Install every skill in the source. */
  all: boolean
  providers: string[]
  scope: string
  branch: string | undefined
  path: string
}

export const run = (args: AddArgs) =>
  Effect.gen(function* () {
    const url = resolveUrl(args.source);
    const branch = args.branch ?? "main";

    yield* Console.log(`Fetching available skills from ${args.source}...`);
    const { basePath, skills } = yield* listRemoteSkills(url, args.path);

    if (skills.length === 0) {
      yield* Console.log(`No skills found in ${args.source}.`);
      return;
    }

    const selectedSkills = yield* selectSkills(args.skill, args.all, skills);
    if (selectedSkills.length === 0) {
      yield* Console.log("No skills selected.");
      return;
    }

    const providers = yield* resolveProviders(args.providers);

    yield* installSkills({
      source: args.source,
      skills: selectedSkills,
      providers,
      scope: resolveScope(args.scope),
      branch,
      path: basePath,
    });
  });

function selectSkills(skillArg: string, all: boolean, skills: RemoteSkill[]): Effect.Effect<string[], EngramError> {
  if (all) return Effect.succeed(skills.map((s) => s.path));

  const requested = splitCsv(skillArg);
  if (requested.length > 0) {
    const available = new Set(skills.map((s) => s.path));
    const unknown = requested.filter((r) => !available.has(r));
    if (unknown.length > 0) {
      return Effect.fail(new EngramError({ message: `skill(s) not found in source: ${unknown.join(", ")}` }));
    }
    return Effect.succeed(requested);
  }

  return Effect.tryPromise({
    try: async () => {
      const hasGroups = skills.some((s) => s.path.includes("/"));
      const hint = styleText("dim", "↑↓ navigate  ·  space toggle   ·  enter confirm");
      const result = hasGroups
        ? await groupMultiselect<string>({
            message: `Select skills to install\n  ${hint}`,
            options: buildGroupedOptions(skills),
            required: false,
          })
        : await multiselect<string>({
            message: `Select skills to install\n  ${hint}`,
            options: skills.map((s) => ({ value: s.path, label: s.path, ...(s.description !== undefined && { hint: s.description }) })),
            required: false,
          });
      if (isCancel(result)) return [];
      return result;
    },
    catch: (e) => new EngramError({ message: String(e) }),
  });
}

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
