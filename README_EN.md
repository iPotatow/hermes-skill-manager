<div align="center">

# Hermes Skill Manager

**Manage skills in native Hermes Desktop and share one real Skill directory across agents with symlinks.**

English · [简体中文](README.md)

</div>

Hermes Skill Manager is a standalone Hermes Desktop plugin for viewing and maintaining Hermes, skills.sh, QwenWork, WorkBuddy, and Codex skills. Starting with `1.11.0`, the new **Agent Links** page keeps skill files in their original directories and exposes them to other agents with directory symlinks instead of copied skill trees.

Version: `1.12.0`

## Core model

```text
Original Skill directory (the only real files)
        │
        ├── symlink → Hermes/skills
        ├── symlink → Codex/skills
        ├── symlink → QwenWork/skills
        └── symlink → WorkBuddy/skills
```

- **Files stay where they are.** Sharing never moves or copies the source directory.
- **Any discovered real Skill can be a source.** Hermes, skills.sh, Codex, QwenWork, and WorkBuddy are supported origins.
- **Target agents contain only symlinks.** Current targets are Hermes, Codex, QwenWork, and WorkBuddy.
- **Real target content is never overwritten.** A real file or directory with the same name is protected even when force confirmation is supplied.
- **Unlink removes only the symlink.** The source Skill is not modified.

## What you get

### One place for five skill sources

- **Hermes** — built-in, Skills Hub community, and local skills.
- **skills.sh** — reads `~/.agents/skills` and global `.skill-lock.json` metadata.
- **QwenWork** — reads `~/.qwenworkcn/skills` while excluding bundled app skills.
- **WorkBuddy** — reads `~/.workbuddy/skills` while excluding bundled app skills.
- **Codex** — reads user skills while hiding `.system` skills.

### Agent Links

The Desktop sidebar includes a new **Agent Links** page. It combines every usable real source Skill into one table and shows a binding state for each target agent:

| State | Meaning | Action |
|---|---|---|
| Origin | The Skill already belongs to this agent | None |
| Not linked | No same-name target exists | Create symlink |
| Linked | Target points to this source | Click to unlink |
| Other link | Same-name symlink points elsewhere | Exact-name confirmation, then rebind |
| Broken link | Same-name symlink target is missing | Exact-name confirmation, then rebind |
| Real path occupied | A real file/directory owns that name | Never auto-overwrite |

For example, a real QwenWork Skill can be linked into Hermes and Codex, while one Hermes local Skill can be linked into Codex, QwenWork, and WorkBuddy. A Skill cannot be linked back into its own origin agent.

### Existing management stays available

| Source | Existing operations |
|---|---|
| Hermes built-in | Reset, delete, restore |
| Hermes community | Reset, update, delete |
| Hermes local | Delete |
| skills.sh | Search, categorize, inspect source metadata |
| QwenWork | Search, categorize, inspect, safely delete |
| WorkBuddy | Search, categorize, inspect, safely delete |
| Codex | Inspect and delete user skills |

The legacy Hermes → Codex **sync** endpoint remains compatible, but its implementation now creates a symlink instead of copying the skill directory.

## Quick start

Install and enable the backend first:

```bash
hermes plugins install iPotatow/hermes-skill-manager
hermes plugins enable skill-manager
```

Version `1.12.0` uses the official unified package layout, `desktop/plugin.js`. Current Hermes Desktop copies the Desktop half automatically. Enable it in **Capabilities → Plugins** separately from the Python backend, restart the gateway, then **Rescan** or **Reload desktop plugins**.

A previous manually installed `desktop-plugins/skill-manager` folder may not be overwritten by the host. Replace its entry with the single `desktop/plugin.js`, or remove the old manual installation before Rescan. For remote gateways, use **Install from Git** to install the Desktop half on the local computer too.

Plugin ID: `skill-manager`  
Original manager route: `/skill-manager`  
Agent Links route: `/skill-manager/links`

## How symlink sharing works

Suppose the real Skill lives at:

```text
~/.qwenworkcn/skills/pdf
```

Selecting **Link to Codex** creates:

```text
~/.codex/skills/pdf -> ~/.qwenworkcn/skills/pdf
```

Changes to `SKILL.md`, scripts, or references under the QwenWork source are immediately visible to Codex because both agents see the same files.

Selecting **Unlink Codex** only unlinks `~/.codex/skills/pdf`; the original QwenWork directory remains unchanged.

## Safety boundaries

Symlink operations enforce these rules:

- The source must be a real Skill directory already discovered by the plugin and must contain a valid `SKILL.md`.
- Arbitrary user-provided source paths are not accepted.
- Targets are restricted to direct children of known agent skill roots.
- Real target files/directories are never removed or overwritten automatically.
- Replacing a same-name symlink requires exact Skill-name confirmation.
- Unlink verifies that the target symlink belongs to the selected source before removing it.
- skills.sh canonical files and lock metadata remain owned by skills.sh; Agent Links does not rewrite the lock file.

Normal **Delete skill** operations still belong to each source ecosystem and can physically remove the source directory. **Unlink** is intentionally separate and removes only a binding.

## Updating the plugin

The page-level **Update plugin** action pulls the checkout and atomically replaces the generated single-file Desktop entry, including migration from the old source layout.

Python backend changes still require a Hermes gateway restart.

## Architecture

```text
desktop/plugin.js          # Agent Links extension entry
src/plugin-core.js         # original Skill Manager Desktop UI source
dashboard/manifest.json                         # backend mount
dashboard/plugin_api.py                         # FastAPI request adapter
dashboard/skill_manager/filesystem.py           # safe paths, atomic operations, symlink primitives
dashboard/skill_manager/service.py              # source resolution, link/unlink use cases
dashboard/skill_manager/inventory.py            # ecosystem discovery
dashboard/skill_manager/skills_sh.py             # read-only skills.sh discovery + lock metadata
tests/                                          # Desktop and backend tests
```

## Verification

```bash
python3 -m pip install -r requirements-test.txt
node --check desktop/plugin.js
python3 scripts/build_desktop.py --check
node --test tests/*.test.js
python3 -m unittest discover -s tests -v
```

## Official contract and compatibility

Reviewed against the [native plugin guide](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins) and [Desktop SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk), upstream commit `09e2ffcab79322cdd9037660fe87004bbd8fd18f` (2026-10-13). The backend now imports mutation helpers from their post-decomposition defining modules. Skill discovery, Hub lock and bundled manifest helpers remain internal Hermes dependencies and require upgrade verification.

Translation sync prefers official Chinese text, reviewed local fallbacks, then the existing snapshot. Future missing translations produce Actions warnings and `missingTranslations`; runtime falls back to original skill descriptions. `--strict` fails before writing an incomplete snapshot. Scheduled sync commits only to `dev`; promotion to `main` is a separate squash merge.

After editing `src/`, run `python3 scripts/build_desktop.py`. CI checks that the shipped entry matches its sources. Installation requires no build step.
