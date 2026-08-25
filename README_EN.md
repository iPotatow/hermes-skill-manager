<div align="center">

# Hermes Skill Manager

**Manage Hermes, QwenWork, WorkBuddy, and Codex skills from one native Hermes Desktop interface.**

English · [简体中文](README.md)

</div>

Hermes Skill Manager is a standalone native Hermes Desktop plugin for viewing, maintaining, and synchronizing skills spread across multiple ecosystems. It brings Hermes built-in skills, Skills Hub community skills, local skills, QwenWork, WorkBuddy, and Codex user skills into one management surface while preserving the safety boundaries and operation rules of each source.

Current version: `1.10.1`

## Why it exists

Skills do not always live in one place. Hermes has built-in, community, and local sources; QwenWork and WorkBuddy maintain separate skill directories; Codex has its own user skills. Managing them manually means jumping between directories, copying files, checking sources, and cleaning up duplicates—with plenty of room for mistakes.

Hermes Skill Manager has one goal: **turn skill management into a visible, confirmable, and recoverable Desktop workflow.**

## What you get

### One place for four skill ecosystems

- **Hermes** — browse built-in, community, and local skills with source, category, and full-text filtering.
- **QwenWork** — reads `~/.qwenworkcn/skills`, automatically excludes app-bundled skills, and shows only manageable custom or imported skills.
- **WorkBuddy** — reads `~/.workbuddy/skills`, automatically excludes app-bundled skills, and shows only manageable custom or imported skills.
- **Codex** — inspect user skills and distinguish skills synced from Hermes from Codex-only skills.

### Built for real operations, not just browsing

| Source | Available operations |
|---|---|
| Hermes built-in skills | Reset, delete, restore, sync to Codex |
| Hermes community skills | Reset, update, delete, sync to Codex |
| Hermes local skills | Delete, sync to Codex |
| QwenWork skills | Search, categorize, inspect, safely delete |
| WorkBuddy skills | Search, categorize, inspect, safely delete |
| Codex user skills | Inspect source, delete |

High-risk actions such as delete, reset, and replacing an existing Codex skill require exact-name confirmation. Operations are shown as a three-stage **Confirm → Apply → Refresh** flow, with progress and final status mirrored in the affected row.

### A native Hermes Desktop experience

- Native Desktop sidebar page and `⌘K` command entry.
- Compact table layout with top-level Hermes, QwenWork, WorkBuddy, and Codex views.
- Direct row actions instead of hidden dropdown menus.
- English and Chinese UI, responsive layout, and Hermes Desktop theme support.
- Skill details with `Esc` to close, focus trapping, and focus restoration.
- A page-level plugin update action with Desktop entry hot reload support.

## Quick start

This repository contains both the Desktop UI and its Python backend. Install and enable the backend first:

```bash
hermes plugins install iPotatow/hermes-skill-manager
hermes plugins enable skill-manager
```

Then install the Desktop entry point:

```bash
HERMES_DIR="${HERMES_HOME:-$HOME/.hermes}"
mkdir -p "$HERMES_DIR/desktop-plugins/skill-manager"
cp desktop-plugins/skill-manager/plugin.js \
  "$HERMES_DIR/desktop-plugins/skill-manager/plugin.js"
```

Restart the Hermes gateway when finished. If **Skill Manager** does not appear in the sidebar, run **Reload desktop plugins** from `⌘K`.

Plugin ID: `skill-manager`  
Desktop route: `/skill-manager`

## How it works

Hermes Skill Manager does not register a Hermes Dashboard page. The Dashboard manifest only mounts the backend API; the actual user interface is provided by the native Hermes Desktop plugin.

The Hermes view treats built-in, community, and local skills as peer sources. QwenWork, WorkBuddy, and Codex each use their own top-level view. QwenWork and WorkBuddy views are hidden automatically when no manageable skills are found.

Chinese descriptions for Hermes built-in skills come from the [official Hermes Chinese skills catalog](https://hermes-agent.nousresearch.com/docs/zh-Hans/reference/skills-catalog). A weekly GitHub Actions workflow synchronizes the official documentation into an offline snapshot, and missing official Chinese text prevents an invalid snapshot from being committed.

## Sync to Codex

Hermes built-in, community, and local skills can all be synchronized into the Codex user skill directory with one action.

During sync, the plugin:

- Validates source and destination paths and rejects path traversal, symlinks, and special files.
- Replaces the destination atomically through a temporary directory to avoid partial state.
- Requires exact-name confirmation before replacing an existing Codex skill.
- Records the Hermes source so Codex can distinguish **Synced from Hermes** from **Codex only** skills.
- Hides Codex `.system` skills and manages user skills only.

## Safety boundaries

Filesystem operations verify that targets remain inside the active Hermes profile's skill directory and reject symlinks at every path component.

Delete operations physically remove skill directories. **This version does not create backups.** When deleting a community skill, the plugin also removes the currently discovered residual copy and invalidates discovery caches so the skill cannot immediately reappear as a local skill.

Operation history is stored at:

```text
$HERMES_HOME/state/plugins/skill-manager.json
```

The current version remains compatible with the previous state file format. Third-party Hermes plugins execute local code, so install only sources you trust.

## Updating the plugin

After installation, select **Update plugin** at the top of the page. Once confirmed, Hermes pulls the Git checkout from the plugin installation directory and atomically synchronizes the Desktop entry.

- Desktop-only changes can be hot reloaded.
- Python backend changes still require a Hermes gateway restart.
- If uncommitted local changes conflict with the remote update, Git stops instead of overwriting them, and the UI surfaces the original error.

## Migrating from 1.4.1 or earlier

The repository has moved to `iPotatow/hermes-skill-manager`, and the plugin ID is now `skill-manager`. Because a plugin ID rename cannot be completed through a normal hot update, install the new identity once:

```bash
hermes plugins disable desktop-skill-manager
hermes plugins install iPotatow/hermes-skill-manager
hermes plugins enable skill-manager
```

Then install the new Desktop entry using the commands in **Quick start** and restart the Hermes gateway. The new state file automatically reads the old plugin history.

## Architecture

```text
desktop-plugins/skill-manager/plugin.js          # native Desktop UI
dashboard/manifest.json                         # backend mount only; no Dashboard page
dashboard/plugin_api.py                         # FastAPI request adapter and error mapping
dashboard/skill_manager/                        # discovery, filesystem operations, sync, state, and use cases
dashboard/data/builtin_catalog.json             # offline snapshot of official Chinese built-in descriptions
scripts/sync_builtin_catalog.py                 # official catalog snapshot sync tool
.github/workflows/sync-skill-translations.yml  # weekly official Chinese snapshot sync
tests/                                          # Desktop and backend tests
```

Hermes Desktop requires `plugin.js` to remain a single uncompiled ESM file. `plugin_api.py` only adapts FastAPI requests and errors; skill discovery, runtime calls, state, synchronization, and filesystem operations live under `dashboard/skill_manager/`.

Every API request resolves the active Hermes profile again. Process-wide locks protect history writes and Codex synchronization from concurrent updates.

## Verification

```bash
node --check desktop-plugins/skill-manager/plugin.js
node --test tests/desktop_plugin_smoke.test.js
python3 -m unittest discover -s tests -v
```
