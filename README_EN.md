# Hermes Desktop Skill Manager

English | [简体中文](README.md)

`desktop-skill-manager` is a standalone native Hermes Desktop plugin for inspecting and maintaining built-in, Skills Hub, and local skills, and for syncing community or local Hermes skills into Codex. It contains no Dashboard page and does not depend on the Dashboard plugin repository.

## Features

- Native Desktop sidebar page and `⌘K` command
- Full-text search with source, category, and status filters
- Skill details, recent actions, diagnostics, and automatic refresh
- Built-in reset/delete/restore; Hub reset/update/delete; local delete
- Exact-name confirmation for delete and reset
- Community and local skills show the “Sync” action and can be copied to `$CODEX_HOME/skills/<skill-name>`; built-ins do not show it, and replacement requires exact-name confirmation
- A separate Codex skills list shows discovered user and system skills under `$CODEX_HOME/skills`
- English/Chinese UI, responsive layout, and Hermes Desktop theme support

## Installation

This repository includes both the Desktop UI and its own Python backend. Install and enable the backend first:

```bash
hermes plugins install iPotatow/hermes-desktop-skill-manager
hermes plugins enable desktop-skill-manager
```

Then install the Desktop entry point:

```bash
HERMES_DIR="${HERMES_HOME:-$HOME/.hermes}"
mkdir -p "$HERMES_DIR/desktop-plugins/desktop-skill-manager"
cp desktop-plugins/desktop-skill-manager/plugin.js \
  "$HERMES_DIR/desktop-plugins/desktop-skill-manager/plugin.js"
```

Restart the Hermes gateway after Python backend changes. The Desktop file hot-reloads automatically; if **Skills** does not appear, run **Reload desktop plugins** from `⌘K`.

## Layout

```text
desktop-plugins/desktop-skill-manager/plugin.js  # native Desktop UI
dashboard/manifest.json                         # backend mount only; no Dashboard page
dashboard/plugin_api.py                         # skill-management API
dashboard/data/builtin_catalog.json             # built-in descriptions
tests/                                          # Desktop and backend tests
```

## Safety

- Filesystem actions verify that targets remain inside the active profile's skill directory.
- Sync rejects path traversal, symlinks, and special files, then atomically replaces the destination through a temporary directory.
- Delete physically removes the skill directory; this version creates no backup.
- History is stored at `$HERMES_HOME/state/plugins/desktop-skill-manager.json`.
- Third-party plugins execute local code; install only trusted sources.

## Verification

```bash
node --check desktop-plugins/desktop-skill-manager/plugin.js
node --test tests/desktop_plugin_smoke.test.js
python3 -m unittest discover -s tests -v
```

Plugin ID: `desktop-skill-manager` · Desktop route: `/desktop-skill-manager` · Version: `1.2.0`
