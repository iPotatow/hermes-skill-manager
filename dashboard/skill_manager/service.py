"""Compatibility facade around the main Skill Manager service implementation."""

from __future__ import annotations

from typing import Any

from .errors import SkillManagerError
from .filesystem import link_skill, safe_link_target
from .service_core import SkillManager as _SkillManager


class SkillManager(_SkillManager):
    """Keep the legacy Codex sync contract while sharing by symlink."""

    def sync_codex(
        self,
        source: str,
        name: str,
        confirm: str = "",
        force: bool = False,
    ) -> dict[str, Any]:
        row, source_path, origin_agent = self._resolve_link_source(source, name)
        if origin_agent != "hermes":
            raise SkillManagerError(400, "旧 Codex 同步接口只接受 Hermes 技能来源")
        if force:
            self._confirm(confirm, row["name"])

        target = None
        resolver = getattr(self.inventory_reader, "safe_codex_target", None)
        if callable(resolver):
            try:
                target = resolver(row["name"], create_root=True)
            except SkillManagerError:
                # An existing symlink is intentionally rejected by the old
                # destructive-path resolver; the link-aware resolver below is
                # the safe fallback for the new binding model.
                target = None
        if target is None:
            target = safe_link_target(
                self._agent_skills_root("codex"),
                row["name"],
                "codex 技能名或路径不安全",
                create_root=True,
            )

        try:
            with self._sync_lock:
                created = link_skill(source_path, target, force=force)
        except SkillManagerError:
            raise
        except Exception as exc:
            raise SkillManagerError(500, f"链接到 codex 失败：{exc}") from exc

        self._record("sync-codex", row)
        return {
            "ok": True,
            "skill": row,
            "originAgent": origin_agent,
            "targetAgent": "codex",
            "sourcePath": str(source_path),
            "targetPath": str(target),
            "codexPath": str(target),
            "linked": created,
            "unchanged": not created,
        }
