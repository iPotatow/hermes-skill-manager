"""Profile-aware filesystem locations used by the skill manager."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def resolve_hermes_home() -> Path:
    try:
        from hermes_constants import get_hermes_home

        return Path(get_hermes_home())
    except Exception:
        return Path.home() / ".hermes"


def resolve_hermes_skills_dir() -> Path:
    try:
        from tools.skills_tool import _skills_dir

        return Path(_skills_dir())
    except Exception:
        return resolve_hermes_home() / "skills"


def resolve_codex_home() -> Path:
    configured = os.environ.get("CODEX_HOME", "").strip()
    return Path(configured).expanduser() if configured else Path.home() / ".codex"


@dataclass(frozen=True)
class SkillPaths:
    """Resolve active-profile paths lazily; overrides keep tests hermetic."""

    home_override: Path | None = None
    skills_override: Path | None = None
    codex_home_override: Path | None = None

    @property
    def home(self) -> Path:
        return Path(self.home_override) if self.home_override is not None else resolve_hermes_home()

    @property
    def skills(self) -> Path:
        return Path(self.skills_override) if self.skills_override is not None else resolve_hermes_skills_dir()

    @property
    def codex_home(self) -> Path:
        return Path(self.codex_home_override) if self.codex_home_override is not None else resolve_codex_home()

    @property
    def codex_skills(self) -> Path:
        return self.codex_home / "skills"

    @property
    def state(self) -> Path:
        return self.home / "state" / "plugins" / "desktop-skill-manager.json"

    @property
    def legacy_state(self) -> Path:
        return Path(__file__).resolve().parents[2] / "state.json"

    @property
    def builtin_catalog(self) -> Path:
        return Path(__file__).resolve().parents[1] / "data" / "builtin_catalog.json"
