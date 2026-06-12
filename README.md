# engram

AI skill manager backed by git repositories. Install and share skills across projects and teams.

## Install

```sh
# Run directly without installing
npx engram --help

# Or install globally
npm install -g engram
engram --help
```

## Concepts

- **Skill** — a folder of instructions and resources that an AI agent loads (follows the [open agent skills standard](https://github.com/agentskills/agentskills))
- **Source** — a git repository that holds skills. Reference it as a GitHub shorthand (`owner/repo`) or any clonable git URL (`https://…`, `git@…`, `ssh://…`, `file://…`)
- **Provider** — the AI tool a skill is installed for: `claude` or `copilot`
- **Scope** — `global` (available across all projects) or `project` (committed to the current repo)

## Quickstart

```sh
# 1. Browse the skills in a repo
engram search vercel-labs/agent-skills

# 2. Add skills from a repo — lists them and lets you pick
engram add vercel-labs/agent-skills

# 3. Pick specific skills non-interactively, for Claude, into the project
engram add vercel-labs/agent-skills --skill frontend-design,deploy --provider claude --scope project
```

No registries to configure — point `engram add` at any repo and go.

## Commands

### `engram add`

Add skills from a source repo. Lists every skill it finds, then installs your selection. Omit `--skill` for an interactive picker; pass `--skill a,b` for specific skills or `--skill '*'` for all.

```sh
engram add owner/repo                              # interactive picker
engram add owner/repo --skill code-review          # one skill
engram add owner/repo --skill code-review,standup  # several
engram add owner/repo --skill '*'                  # all skills
engram add owner/repo --provider claude,copilot --scope project
engram add owner/repo --branch experimental
engram add owner/repo --path skills                # skills live under skills/
```

| Flag | Default | Description |
|---|---|---|
| `--skill` | prompted | Comma-separated skill paths, or `*` for all |
| `--provider` | prompted | Comma-separated: `claude`, `copilot` |
| `--scope` | `global` | `global` or `project` |
| `--branch` | `main` | Branch to fetch from |
| `--path` | auto | Sub-directory holding skills (auto-detected, e.g. `skills/`) |

Each skill is materialized once in a canonical store (`$XDG_DATA_HOME/engram/store/`, default `~/.local/share/engram/store/`) and **symlinked** into each provider directory — a single source of truth, with a copy fallback where symlinks aren't available.

**Global** installs link into:
- Claude → `~/.claude/skills/<skill>/`
- Copilot → `~/.agents/skills/<skill>/`

**Project** installs link into:
- Claude → `.claude/skills/<skill>/`
- Copilot → `.github/skills/<skill>/`

Project installs also write an entry to `engram.json` — pinned to the exact commit SHA — so teammates can reproduce the install.

### `engram install`

Install a single skill directly, without the interactive listing. Takes the source and skill as two arguments — handy for scripts. When skills live in a sub-directory, pass `--path` (the interactive `add` auto-detects it).

```sh
engram install owner/repo code-review
engram install owner/repo code-review --provider claude,copilot --scope project
engram install owner/repo code-review --path skills --branch experimental
```

### `engram sync`

Re-install all skills declared in `engram.json`, pinned to the exact commit SHA recorded in the manifest (reproducible installs).

```sh
engram sync
engram sync --dir /path/to/project
```

Teammates run this after cloning, or after pulling a commit that added new skills.

### `engram remove`

Remove an installed skill.

```sh
# Project: pass the manifest id (source/skill), as shown by `engram list`
engram remove owner/repo/code-review --scope project
engram remove owner/repo/code-review --scope project --keep-files  # manifest only

# Global: pass the skill path
engram remove code-review
```

### `engram list`

List installed skills.

```sh
engram list
engram list --scope global
engram list --scope project
```

### `engram search`

Browse the skills in a source repo without installing.

```sh
engram search owner/repo            # list all
engram search owner/repo review     # filter by name
engram search owner/repo --path skills
```

## Project manifest (`engram.json`)

When you install with `--scope project`, engram writes to `engram.json`:

```json
{
  "skills": {
    "vercel-labs/agent-skills/frontend-design": {
      "source": "vercel-labs/agent-skills",
      "skill": "frontend-design",
      "sha": "77208fa958572fbfe1b02d90ea1cacff0568cd8f",
      "providers": ["claude"]
    },
    "myorg/skills/standup": {
      "source": "myorg/skills",
      "skill": "standup",
      "branch": "experimental",
      "path": "skills",
      "sha": "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
      "providers": ["claude", "copilot"]
    }
  }
}
```

Each entry records its `source` repo and pinned `sha`, so `engram sync` reproduces the exact same skills. Commit this file; teammates run `engram sync` to get the same setup.

## Source layout

A source is a plain git repo. Skills are subdirectories, either at the repo root or under a common folder:

```
my-skills-repo/
├── code-review/
│   └── code-review.md
├── standup/
│   └── standup.md
└── ...
```

engram auto-detects a single wrapping directory (e.g. `skills/`); override it with `--path`.
