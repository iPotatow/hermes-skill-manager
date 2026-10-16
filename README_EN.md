<div align="center">

# Hermes Skill Manager

**Manage skills in native Hermes Desktop and share one real Skill directory across agents with symlinks.**

English · [简体中文](README.md)

</div>

Hermes Skill Manager is a standalone Hermes Desktop plugin for viewing and maintaining Hermes, skills.sh, QwenWork, WorkBuddy, and Codex skills. Starting with `1.11.0`, the new **Agent Links** page keeps skill files in their original directories and exposes them to other agents with directory symlinks instead of copied skill trees.

Version: `1.11.0`

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

Starting with `1.11.0`, the Desktop entry is split into two uncompiled ESM files, so install both:

```bash
HERMES_DIR="${HERMES_HOME:-$HOME/.hermes}"
mkdir -p "$HERMES_DIR/desktop-plugins/skill-manager"
cp desktop-plugins/skill-manager/plugin.js \
   desktop-plugins/skill-manager/plugin-core.js \
   "$HERMES_DIR/desktop-plugins/skill-manager/"
```

Restart the Hermes gateway. If the pages do not appear, run **Reload desktop plugins** from `⌘K`.

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

The page-level **Update plugin** action remains available. The updater pulls the Git checkout and atomically synchronizes Desktop files. When `plugin-core.js` exists, companion modules are copied first and `plugin.js` is replaced last so hot reload never observes a missing import.

Python backend changes still require a Hermes gateway restart.

## Architecture

```text
desktop-plugins/skill-manager/plugin.js          # Agent Links extension entry
desktop-plugins/skill-manager/plugin-core.js     # original Skill Manager Desktop UI
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
node --check desktop-plugins/skill-manager/plugin.js
node --check desktop-plugins/skill-manager/plugin-core.js
node --test tests/desktop_plugin_smoke.test.js
python3 -m unittest discover -s tests -v
```
