# engram

Install and share AI agent skills from any git repository. No registry, no config — point engram at a repo and go.

## Install

```sh
npx engram --help          # run without installing
npm install -g engram      # or install globally
```

## How it works

A **skill** is a folder of instructions an AI agent loads (the [open agent skills standard](https://github.com/agentskills/agentskills)). engram pulls skills from a **source** (any git repo) and installs them for a **provider** (`claude` or `copilot`), either **globally** (all projects) or in the current **project** (committed to your repo).

## Quickstart

```sh
engram add vercel-labs/agent-skills
```

This lists the skills in the repo and lets you pick which to install. That's the whole loop — browse, pick, done.

To skip the prompts:

```sh
engram add vercel-labs/agent-skills --skill frontend-design,deploy --provider claude --scope project
```

## Commands

### `add` — install skills from a repo

Lists the skills it finds, then installs your selection.

```sh
engram add owner/repo                       # interactive picker
engram add owner/repo --skill code-review   # one skill
engram add owner/repo --skill a,b           # several
engram add owner/repo --skill '*'           # all skills
```

| Flag | Default | Description |
|---|---|---|
| `--skill` | prompted | Comma-separated skill paths, or `*` for all |
| `--provider` | prompted | Comma-separated: `claude`, `copilot` |
| `--scope` | `global` | `global` or `project` |
| `--branch` | `main` | Branch to fetch from |
| `--path` | auto | Sub-directory holding skills (auto-detected) |

A source can be a GitHub shorthand (`owner/repo`) or any clonable git URL (`https://…`, `git@…`, `ssh://…`, `file://…`).

### `install` — install one skill directly

Same as `add` but skips the listing — takes the source and skill as two arguments. Handy in scripts.

```sh
engram install owner/repo code-review
engram install owner/repo code-review --provider claude,copilot --scope project --path skills
```

### `sync` — reproduce a project's skills

Re-installs every skill in `skills.json`, pinned to its recorded commit. Run this after cloning a repo or pulling new skills.

```sh
engram sync
engram sync --dir /path/to/project
```

### `remove` — uninstall a skill

```sh
engram remove owner/repo/code-review --scope project   # use the id from `engram list`
engram remove owner/repo/code-review --scope project --keep-files
engram remove code-review                               # global: use the skill path
```

### `list` — show installed skills

```sh
engram list
engram list --scope project
```

### `search` — browse a repo without installing

```sh
engram search owner/repo          # list all
engram search owner/repo review   # filter by name
```

## Where skills go

Each skill is stored once in a canonical store (`~/.local/share/engram/store/`) and **symlinked** into each provider directory — one source of truth, with a copy fallback where symlinks aren't available.

| | Claude | Copilot |
|---|---|---|
| **global** | `~/.claude/skills/` | `~/.agents/skills/` |
| **project** | `.claude/skills/` | `.github/skills/` |

## Project manifest (`skills.json`)

Project installs (`--scope project`) are recorded in `skills.json`, with each skill pinned to an exact commit. Commit this file so teammates can run `engram sync` and get the identical setup.

```json
{
  "skills": {
    "vercel-labs/agent-skills/frontend-design": {
      "source": "vercel-labs/agent-skills",
      "skill": "frontend-design",
      "sha": "77208fa958572fbfe1b02d90ea1cacff0568cd8f",
      "providers": ["claude"]
    }
  }
}
```

## Source layout

A source is a plain git repo. Skills are subdirectories, at the root or under a common folder (engram auto-detects it; override with `--path`):

```
my-skills-repo/
├── code-review/
│   └── code-review.md
└── standup/
    └── standup.md
```
