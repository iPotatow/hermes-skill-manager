# Hermes Skill Manager

English | [简体中文](README.md)

`skill-manager` (Skill Manager / 技能管理) is a standalone native Hermes Desktop plugin for inspecting and maintaining built-in, Skills Hub, and local skills, and for managing Codex user skills. It contains no Dashboard page and does not depend on the Dashboard plugin repository.

## Features

- Native Desktop sidebar page and `⌘K` command
- The Dashboard manifest mounts backend APIs without adding a Dashboard sidebar item
- Compact tables for Hermes and Codex skills, with no skill-card layout
- Full-text search with source, category, and status filters
- Built-in Chinese descriptions come from the [official Hermes Chinese skills catalog](https://hermes-agent.nousresearch.com/docs/zh-Hans/reference/skills-catalog), with background refresh and an offline snapshot
- Skill details, recent actions, diagnostics, and automatic refresh
- A page-level plugin update button with an explicit second confirmation and automatic Desktop entry hot reload
- Built-in reset/delete/restore; Hub reset/update/delete; local delete
- Exact-name confirmation for delete and reset, with a one-click name-fill button
- Built-in, community, and local skills all show the “Sync” action and can be copied to `$CODEX_HOME/skills/<skill-name>`; replacement requires exact-name confirmation
- Tables place each description below its skill name and clamp it to one line; the full text remains available on hover and in details
- A **Codex** source tab appears immediately after **Local** and swaps the main table to Codex user skills; it hides `.system` and safely deletes user skills
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

Plugin ID: `skill-manager` · Desktop route: `/skill-manager` · Version: `1.5.3`
