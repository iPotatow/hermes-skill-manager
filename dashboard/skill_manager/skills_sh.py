"""Read-only discovery for skills installed by the skills.sh CLI."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


Diagnostic = dict[str, str]


def resolve_skills_sh_skills_dir() -> Path:
    """Return the skills.sh global canonical skills directory."""

    return Path.home() / ".agents" / "skills"


def resolve_skills_sh_lock_path() -> Path:
    """Mirror the skills CLI global lock-file resolution."""

    configured = os.environ.get("XDG_STATE_HOME", "").strip()
    if configured:
        return Path(configured).expanduser() / "skills" / ".skill-lock.json"
    return Path.home() / ".agents" / ".skill-lock.json"


class SkillsShInventory:
    """Discover global skills.sh installs without mutating their files or lock."""

    def __init__(
        self,
        skills_dir: Path | None = None,
        lock_path: Path | None = None,
    ):
        self.skills_dir = Path(skills_dir) if skills_dir is not None else resolve_skills_sh_skills_dir()
        self.lock_path = Path(lock_path) if lock_path is not None else resolve_skills_sh_lock_path()

    @staticmethod
    def _frontmatter_value(content: str, key: str) -> str:
        lines = content.splitlines()
        if not lines or lines[0].strip() != "---":
            return ""
        for line in lines[1:]:
            if line.strip() == "---":
                break
            if line.startswith(f"{key}:"):
                value = line.split(":", 1)[1].strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in {'\"', "'"}:
                    value = value[1:-1]
                return value
        return ""

    @staticmethod
    def _sanitize_name(name: str) -> str:
        """Match the skills CLI directory-name normalization for lock lookup."""

        sanitized = re.sub(r"[^a-z0-9._]+", "-", name.lower())
        sanitized = re.sub(r"^[.\-]+|[.\-]+$", "", sanitized)
        return sanitized[:255] or "unnamed-skill"

    def _locked_skills(self, diagnostics: list[Diagnostic]) -> dict[str, dict[str, Any]]:
        path = self.lock_path.expanduser()
        if not path.is_file():
            return {}
        try:
            parsed = json.loads(path.read_text(encoding="utf-8"))
            skills = parsed.get("skills") if isinstance(parsed, dict) else None
            if not isinstance(parsed, dict) or not isinstance(parsed.get("version"), int):
                raise ValueError("invalid skills.sh lock schema")
            if not isinstance(skills, dict):
                raise ValueError("invalid skills.sh skills map")
            return {
                str(name): entry
                for name, entry in skills.items()
                if isinstance(entry, dict)
            }
        except Exception as exc:
            diagnostics.append({
                "component": "skills-sh-lock",
                "message": str(exc) or exc.__class__.__name__,
            })
            return {}

    def _lock_entry(
        self,
        locked: dict[str, dict[str, Any]],
        name: str,
        directory_name: str,
    ) -> dict[str, Any]:
        entry = locked.get(name) or locked.get(directory_name)
        if entry is not None:
            return entry
        for locked_name, candidate in locked.items():
            if self._sanitize_name(locked_name) == directory_name:
                return candidate
        return {}

    def inventory(self, diagnostics: list[Diagnostic]) -> list[dict[str, Any]]:
        """Return global canonical skills.sh skills with optional lock metadata."""

        root = self.skills_dir.expanduser()
        if not root.exists():
            return []
        try:
            resolved_root = root.resolve()
        except OSError as exc:
            diagnostics.append({
                "component": "skills-sh-skills",
                "message": str(exc) or exc.__class__.__name__,
            })
            return []

        locked = self._locked_skills(diagnostics)
        rows: list[dict[str, Any]] = []
        try:
            children = sorted(root.iterdir(), key=lambda path: path.name.lower())
        except OSError as exc:
            diagnostics.append({
                "component": "skills-sh-skills",
                "message": str(exc) or exc.__class__.__name__,
            })
            return []

        for skill_dir in children:
            try:
                if skill_dir.is_symlink() or not skill_dir.is_dir():
                    continue
                skill_md = skill_dir / "SKILL.md"
                if skill_md.is_symlink() or not skill_md.is_file():
                    continue
                resolved = skill_md.resolve()
                if not resolved.is_relative_to(resolved_root):
                    continue

                content = resolved.read_text(encoding="utf-8")
                name = self._frontmatter_value(content, "name") or skill_dir.name
                description = self._frontmatter_value(content, "description")[:500]
                description_zh = self._frontmatter_value(content, "description_zh")[:500]
                entry = self._lock_entry(locked, name, skill_dir.name)
                raw_source = str(entry.get("source", "") or "skills.sh")
                source_type = str(entry.get("sourceType", "") or "")
                identifier = (
                    f"{raw_source}/{skill_dir.name}"
                    if raw_source != "skills.sh"
                    else skill_dir.name
                )
                installed_at = str(entry.get("installedAt", "") or "")
                updated_at = str(entry.get("updatedAt", "") or "")
                if not updated_at:
                    updated_at = datetime.fromtimestamp(
                        resolved.stat().st_mtime, timezone.utc
                    ).isoformat()

                rows.append({
                    "name": name,
                    "category": source_type,
                    "kind": "skills-sh",
                    "source": "skills.sh",
                    "rawSource": raw_source,
                    "trustLevel": "community" if entry else "local",
                    "status": "enabled",
                    "installPath": skill_dir.name,
                    "relativePath": skill_dir.name,
                    "identifier": identifier,
                    "description": description_zh or description,
                    "descriptionZh": description_zh or description,
                    "descriptionEn": description,
                    "installedAt": installed_at,
                    "updatedAt": updated_at,
                    "availableActions": [],
                    "sourceType": source_type,
                    "sourceUrl": str(entry.get("sourceUrl", "") or ""),
                    "ref": str(entry.get("ref", "") or ""),
                    "skillPath": str(entry.get("skillPath", "") or ""),
                    "skillFolderHash": str(entry.get("skillFolderHash", "") or ""),
                })
            except Exception as exc:
                diagnostics.append({
                    "component": "skills-sh-skill",
                    "message": str(exc) or exc.__class__.__name__,
                })

        return sorted(rows, key=lambda row: (str(row["name"]).lower(), row["relativePath"]))
