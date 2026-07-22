# Hermes Skill Manager

English | [简体中文](README.md)

`skill-manager` (Skill Manager / 技能管理) is a standalone native Hermes Desktop plugin for inspecting and maintaining built-in, Skills Hub, and local skills, and for managing Codex user skills. It contains no Dashboard page and does not depend on the Dashboard plugin repository.

## Features

- Native Desktop sidebar page and `⌘K` command
- The Dashboard manifest mounts backend APIs without adding a Dashboard sidebar item
- Compact tables for Hermes and Codex skills, with no skill-card layout
- Top-level Hermes/Codex segmented views, with source filters scoped to the Hermes inventory
- Responsive, wrapping search and filters with full-text search and one-click reset
- Built-in Chinese descriptions come from the [official Hermes Chinese skills catalog](https://hermes-agent.nousresearch.com/docs/zh-Hans/reference/skills-catalog), follow the Desktop UI language, and use background refresh with an offline snapshot
- Skill details, recent actions, diagnostics, and automatic refresh
- A page-level plugin update button with an explicit second confirmation and automatic Desktop entry hot reload
- Built-in reset/delete/restore; Hub reset/update/delete; local delete
- Exact-name confirmation for delete and reset, with a one-click name-fill button
- Built-in, community, and local skills all show the “Sync” action and can be copied to `$CODEX_HOME/skills/<skill-name>`; replacement requires exact-name confirmation
- The main table shows Skill, Category, Source, Codex status, and Actions; source kind and repository share one cell, while descriptions stay on one line below skill names
- Each row keeps Sync or Restore visible and moves update, reset, and delete into a native overflow menu; table headers and edge columns remain sticky
- The header summarizes unsynced, disabled, restorable, and diagnostic counts; restorable built-ins can be added to the inventory on demand
- The Codex view hides `.system` skills and safely deletes user skills through a low-noise action menu
- Details are grouped into overview, location, and Codex sync sections, with copyable paths, Escape-to-close, focus trapping, and focus restoration
- English/Chinese UI, responsive layout, and Hermes Desktop theme support
- Actionable install, enable, and restart guidance when the backend is not mounted

## Installation

This repository includes both the Desktop UI and its own Python backend. Install and enable the backend first:

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

Restart the Hermes gateway after Python backend changes. The Desktop file hot-reloads automatically; if **Skill Manager** does not appear, run **Reload desktop plugins** from `⌘K`.

After installation, you can also select **Update plugin** at the top of the page. Once confirmed, Hermes pulls the installed Git checkout and atomically synchronizes the Desktop entry. Restart the Hermes gateway if backend files changed. If uncommitted changes conflict with the update, Git stops and the UI shows its original error.

### Migrating from 1.4.1 or earlier

This release renames the repository to `iPotatow/hermes-skill-manager` and the plugin ID to `skill-manager`. Because an ID rename cannot be completed by a normal hot update, install the new identity once and disable the old one:

```bash
hermes plugins disable desktop-skill-manager
hermes plugins install iPotatow/hermes-skill-manager
hermes plugins enable skill-manager
```

Then install the new Desktop entry with the commands above and restart the Hermes gateway. The new state file automatically reads the old plugin history.

## Architecture

- Hermes Desktop requires `plugin.js` to remain one uncompiled ESM file; internally it is layered into policy helpers, data queries, action orchestration, and small UI components.
- `plugin_api.py` only adapts FastAPI requests and domain errors. Discovery, paths, filesystem operations, runtime calls, state, and use cases live independently under `dashboard/skill_manager/`.
- Every API request resolves the active Hermes profile again. Process-wide locks protect history writes and Codex synchronization from concurrent requests.

## Layout

```text
desktop-plugins/skill-manager/plugin.js          # native Desktop UI
dashboard/manifest.json                         # backend mount only; no Dashboard page
dashboard/plugin_api.py                         # thin FastAPI adapter
dashboard/skill_manager/                        # testable domain and infrastructure
dashboard/data/builtin_catalog.json             # offline snapshot of official Chinese descriptions
scripts/sync_builtin_catalog.py                 # official catalog snapshot sync tool
tests/                                          # Desktop and backend tests
```

## Safety

- Filesystem actions verify that targets remain inside the active profile's skill directory and reject symlinks at every path component.
- Sync rejects path traversal, symlinks, and special files, then atomically replaces the destination through a temporary directory.
- Delete physically removes the skill directory; this version creates no backup.
- History is stored at `$HERMES_HOME/state/plugins/skill-manager.json`, with read compatibility for the old state file.
- Third-party plugins execute local code; install only trusted sources.

## Verification

```bash
node --check desktop-plugins/skill-manager/plugin.js
node --test tests/desktop_plugin_smoke.test.js
python3 -m unittest discover -s tests -v
```

Plugin ID: `skill-manager` · Desktop route: `/skill-manager` · Version: `1.6.0`
