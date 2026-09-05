"""Narrow adapter around Hermes runtime operations."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .errors import SkillManagerError
from .filesystem import copy_file_atomic, preflight_copy_file


class HermesRuntime:
    """Invoke Hermes APIs without leaking them into domain orchestration."""

    @staticmethod
    def clear_skill_cache() -> None:
        try:
            from agent.prompt_builder import clear_skills_system_prompt_cache

            clear_skills_system_prompt_cache(clear_snapshot=True)
        except Exception:
            pass
        try:
            from tools import skills_tool

            discovery_cache = getattr(skills_tool, "_SKILLS_CACHE", None)
            if hasattr(discovery_cache, "clear"):
                discovery_cache.clear()
        except Exception:
            pass

    @staticmethod
    def uninstall(name: str) -> None:
        from tools.skills_hub import uninstall_skill

        ok, message = uninstall_skill(name)
        if not ok:
            raise SkillManagerError(500, message)

    @staticmethod
    def reset_builtin(name: str) -> dict[str, Any]:
        from tools.skills_sync import reset_bundled_skill

        result = reset_bundled_skill(name, restore=True)
        if not result.get("ok"):
            raise SkillManagerError(500, result.get("message", "重置内建技能失败"))
        return result

    @staticmethod
    def reset_hub(name: str, identifier: str, category: str) -> dict[str, Any]:
        from hermes_cli.skills_hub import do_install
        from tools.skills_hub import HubLockFile

        lock = HubLockFile()
        before = lock.get_installed(name)
        if not before:
            raise SkillManagerError(409, "社区技能缺少安装记录，无法可靠重置")
        do_install(
            identifier,
            category=category,
            force=True,
            console=None,
            skip_confirm=True,
            name_override=name,
            source_id=before.get("source") or None,
        )
        after = lock.get_installed(name)
        if not after or after.get("updated_at") == before.get("updated_at"):
            raise SkillManagerError(502, "Hermes 未完成社区技能重置，请检查来源与安全扫描结果")
        return {"ok": True, "status": "reset", "contentHash": after.get("content_hash", "")}

    @staticmethod
    def restore_builtin(name: str) -> dict[str, Any]:
        from tools.skills_sync import reset_bundled_skill

        return reset_bundled_skill(name, restore=True)

    @staticmethod
    def update_hub(name: str) -> dict[str, Any]:
        from hermes_cli.skills_hub import do_update
        from tools.skills_hub import HubLockFile, check_for_skill_updates

        updates = check_for_skill_updates(name=name)
        if not updates:
            raise SkillManagerError(404, "找不到社区技能安装记录")
        update = updates[0]
        status = update.get("status")
        if status == "unavailable":
            raise SkillManagerError(502, "无法从原始来源检查社区技能更新")
        if status == "up_to_date":
            return {"ok": True, "status": status}
        if status != "update_available" or not update.get("latest_hash"):
            raise SkillManagerError(502, "Hermes 返回了无法识别的技能更新状态")
        do_update(name=name, console=None)
        installed = HubLockFile().get_installed(name)
        if not installed or installed.get("content_hash") != update["latest_hash"]:
            raise SkillManagerError(502, "Hermes 未完成社区技能更新，请检查安装输出")
        return {"ok": True, "status": "updated", "contentHash": update["latest_hash"]}

    @staticmethod
    def update_plugin(name: str, plugin_root: Path, desktop_entry: Path) -> dict[str, Any]:
        """Update the checkout through Hermes, then hot-sync Desktop entries."""

        from hermes_cli.plugins_cmd import dashboard_update_user_plugin

        source_dir = plugin_root / "desktop-plugins" / name
        source_entry = source_dir / "plugin.js"
        # Preflight the currently installed entry before mutating the checkout.
        preflight_copy_file(source_entry, desktop_entry)
        result = dashboard_update_user_plugin(name)
        if not result.get("ok"):
            raise SkillManagerError(400, result.get("error", "插件更新失败"))

        # Newer versions may split immutable UI code into companion modules.
        # Validate all companions after the checkout update, then copy companions
        # first and the entry last so hot reload never observes a missing import.
        copies: list[tuple[Path, Path]] = []
        companion = source_dir / "plugin-core.js"
        if companion.is_file():
            companion_target = desktop_entry.parent / companion.name
            preflight_copy_file(companion, companion_target)
            copies.append((companion, companion_target))
        copies.append((source_entry, desktop_entry))

        try:
            for source, target in copies:
                copy_file_atomic(source, target)
        except Exception as exc:
            raise SkillManagerError(
                500,
                "插件仓库已更新，但 Desktop 入口同步失败；请重试更新，成功前不要重启 gateway",
            ) from exc
        return {
            **result,
            "desktopPath": str(desktop_entry),
            "desktopPaths": [str(target) for _source, target in copies],
            "restartRequired": not bool(result.get("unchanged")),
        }
