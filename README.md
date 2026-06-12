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

- **Skill** — a folder of instructions and resources that an AI agent loads (follows the [open agent skills standard](https://github.com/agentskills/spec))
- **Registry** — a git repository whose subdirectories are available skills
- **Provider** — the AI tool a skill is installed for: `claude` or `copilot`
- **Scope** — `global` (available across all projects) or `project` (committed to the current repo)

## Quickstart

```sh
# 1. Add a registry (a git repo containing skills as subdirectories)
engram registry add myorg git@github.com:myorg/skills.git

# 2. Browse available skills
engram search "" --registry myorg

# 3. Install a skill globally for Claude
engram install myorg/code-review --provider claude

# 4. Or install into the current project
engram install myorg/code-review --scope project --provider claude
```

## Commands

### `engram registry`

Manage registries. Config is stored at `~/.config/engram/config.toml`.

```sh
engram registry add <name> <git-url> [--path skills/]
engram registry list
engram registry remove <name>
```

If your skills live under a subdirectory (e.g. `skills/`), pass `--path skills/`.

### `engram install`

Install a skill from a registry.

```sh
engram install myorg/code-review
engram install myorg/code-review --provider claude,copilot
engram install myorg/code-review --scope project
engram install myorg/code-review --branch experimental
```

| Flag | Default | Description |
|---|---|---|
| `--provider` | prompted | Comma-separated: `claude`, `copilot` |
| `--scope` | `global` | `global` or `project` |
| `--branch` | `main` | Branch to fetch from |

Each skill is materialized once in a canonical store (`$XDG_DATA_HOME/engram/store/`, default `~/.local/share/engram/store/`) and **symlinked** into each provider directory — a single source of truth, with a copy fallback where symlinks aren't available.

**Global** installs link into:
- Claude → `~/.claude/skills/<skill>/`
- Copilot → `~/.agents/skills/<skill>/`

**Project** installs link into:
- Claude → `.claude/skills/<skill>/`
- Copilot → `.github/skills/<skill>/`

Project installs also write an entry to `engram.json` — pinned to the exact commit SHA — so teammates can reproduce the install.

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
engram remove myorg/code-review
engram remove myorg/code-review --scope project
engram remove myorg/code-review --keep-files   # remove from manifest only
```

### `engram list`

List installed skills.

```sh
engram list
engram list --scope global
engram list --scope project
```

### `engram search`

Browse available skills in a registry without installing.

```sh
engram search ""                        # list all
engram search review                    # filter by name
engram search review --registry myorg   # specific registry
```

## Project manifest (`engram.json`)

When you install with `--scope project`, engram writes to `engram.json`:

```json
{
  "skills": {
    "myorg/code-review": {
      "sha": "77208fa958572fbfe1b02d90ea1cacff0568cd8f",
      "providers": ["claude"]
    },
    "myorg/standup": {
      "branch": "experimental",
      "sha": "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
      "providers": ["claude", "copilot"]
    }
  }
}
```

The `sha` is recorded automatically on install and used by `engram sync` for reproducible, commit-pinned installs.

Commit this file. Teammates run `engram sync` to get the same skills.

## Registry layout

A registry is a plain git repo. Skills are subdirectories at the configured path:

```
my-skills-repo/
├── code-review/
│   └── skill.md
├── standup/
│   └── skill.md
└── ...
```

With `--path .` (default), skill directories sit at the repo root. With `--path skills/`, they sit under `skills/`.
