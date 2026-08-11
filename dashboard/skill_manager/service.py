"""Application service coordinating discovery, mutations, and history."""

from __future__ import annotations

import shutil
import threading
from typing import Any, Callable

from .constants import PLUGIN_ID
from .errors import SkillManagerError
from .filesystem import copy_skill
from .inventory import Diagnostic, SkillInventory
from .paths import SkillPaths
from .runtime import HermesRuntime
from .state import StateStore


class SkillManager:
    """The use-case boundary consumed by the thin FastAPI adapter."""

    _sync_lock = threading.RLock()
    _plugin_update_lock = threading.RLock()

    def __init__(
        self,
        paths: SkillPaths | None = None,
        inventory: SkillInventory | None = None,
        state: StateStore | None = None,
        runtime: HermesRuntime | None = None,
    ):
        self.paths = paths or SkillPaths()
        self.inventory_reader = inventory or SkillInventory(self.paths)
        self.state = state or StateStore(self.paths.state, self.paths.legacy_state)
        self.runtime = runtime or HermesRuntime()

    @staticmethod
    def _confirm(confirm: str, name: str) -> None:
        if confirm != name:
            raise SkillManagerError(400, "二次确认失败：确认文本必须与技能名一致")

    @staticmethod
    def _kind(row: dict[str, Any]) -> str:
        return str(row.get("kind") or row.get("source") or "")

    def _record(self, action: str, row: dict[str, Any]) -> None:
        self.state.record_best_effort({
            "action": action,
            "source": self._kind(row),
            "name": row.get("name", ""),
        })

    def _complete_mutation(self, action: str, row: dict[str, Any]) -> None:
        self.runtime.clear_skill_cache()
        self._record(action, row)

    @staticmethod
    def _run_external(operation: Callable[[], Any]) -> Any:
        try:
            return operation()
        except SkillManagerError:
            raise
        except Exception as exc:
            raise SkillManagerError(500, str(exc) or exc.__class__.__name__) from exc

    def inventory(self) -> dict[str, Any]:
        diagnostics: list[Diagnostic] = []
        bundled = self.inventory_reader.bundled_skills(diagnostics)
        rows = self.inventory_reader.rows(diagnostics, {item[0] for item in bundled})
        missing = self.inventory_reader.missing_builtin_rows(rows, bundled)
        codex_rows = self.inventory_reader.codex_inventory(diagnostics)
        qwenwork_rows = self.inventory_reader.qwenwork_inventory(diagnostics)
        workbuddy_rows = self.inventory_reader.workbuddy_inventory(diagnostics)
        state = self.state.load()

        counts: dict[str, int] = {}
        categories: dict[str, int] = {}
        enabled_count = 0
        disabled_count = 0
        for row in rows:
            kind = self._kind(row)
            counts[kind] = counts.get(kind, 0) + 1
            category = row.get("category") or "(root)"
            categories[category] = categories.get(category, 0) + 1
            if row["status"] == "enabled":
                enabled_count += 1
            else:
                disabled_count += 1

        return {
            "ok": True,
            "skills": rows,
            "missingBuiltinSkills": missing,
            "counts": counts,
            "missingBuiltinCount": len(missing),
            "enabledCount": enabled_count,
            "disabledCount": disabled_count,
            "categories": categories,
            "history": state.get("history", [])[:5],
            "codexSkills": codex_rows,
            "codexSkillCount": len(codex_rows),
            "qwenworkSkills": qwenwork_rows,
            "qwenworkSkillCount": len(qwenwork_rows),
            "workbuddySkills": workbuddy_rows,
            "workbuddySkillCount": len(workbuddy_rows),
            "diagnostics": diagnostics,
            "meta": {
                "home": str(self.paths.home),
                "skillsDir": str(self.paths.skills),
                "codexSkillsDir": str(self.paths.codex_skills),
                "qwenworkSkillsDir": str(self.paths.qwenwork_skills),
                "workbuddySkillsDir": str(self.paths.workbuddy_skills),
                "generatedAt": self.state.now(),
                "partial": bool(diagnostics),
            },
        }

    def delete(self, source: str, name: str, confirm: str) -> dict[str, Any]:
        self._confirm(confirm, name)
        row = self.inventory_reader.find(source, name)
        if self._kind(row) == "hub-installed":
            displayed_target = self.inventory_reader.safe_target(row["installPath"])
            if displayed_target.exists() and (
                not displayed_target.is_dir()
                or not (displayed_target / "SKILL.md").is_file()
                or (displayed_target / "SKILL.md").is_symlink()
            ):
                raise SkillManagerError(400, "界面中的社区技能路径无效，拒绝删除")
            self._run_external(lambda: self.runtime.uninstall(row["name"]))
            # A stale duplicate can be the path currently displayed while the
            # Hub lock points at a different installation path. Uninstalling
            # clears the lock-owned copy; remove the exact displayed copy too
            # so it cannot immediately reappear as a local skill.
            if displayed_target.exists():
                displayed_target = self.inventory_reader.safe_target(row["installPath"])
                if (
                    displayed_target.is_dir()
                    and (displayed_target / "SKILL.md").is_file()
                    and not (displayed_target / "SKILL.md").is_symlink()
                ):
                    shutil.rmtree(displayed_target)
                else:
                    raise SkillManagerError(409, "社区技能卸载后路径发生变化，已停止清理")
        else:
            target = self.inventory_reader.safe_target(row["installPath"])
            if not target.exists():
                raise SkillManagerError(404, "技能路径不存在")
            shutil.rmtree(target)
        self._complete_mutation("delete", row)
        return {"ok": True, "skill": row}

    def reset(self, source: str, name: str, confirm: str) -> dict[str, Any]:
        self._confirm(confirm, name)
        row = self.inventory_reader.find(source, name)
        kind = self._kind(row)
        if kind == "builtin":
            self._run_external(lambda: self.runtime.reset_builtin(row["name"]))
        elif kind == "hub-installed":
            identifier = row.get("identifier", "")
            if not identifier:
                raise SkillManagerError(400, "该 hub 技能缺少来源标识，无法重置")
            self._run_external(lambda: self.runtime.reset_hub(identifier, row.get("category", "")))
        else:
            raise SkillManagerError(400, "本地技能不支持重置")
        self._complete_mutation("reset", row)
        return {"ok": True, "skill": row}

    def restore(self, name: str) -> dict[str, Any]:
        row = self.inventory_reader.find_missing_builtin(name)
        result = self._run_external(lambda: self.runtime.restore_builtin(row["name"]))
        if not result.get("ok"):
            raise SkillManagerError(500, result.get("message", "恢复内建技能失败"))
        self._complete_mutation("restore", row)
        return {"ok": True, "skill": row, "result": result}

    def update(self, name: str) -> dict[str, Any]:
        row = self.inventory_reader.find("hub-installed", name)
        self._run_external(lambda: self.runtime.update_hub(row["name"]))
        self._complete_mutation("update", row)
        return {"ok": True, "skill": row}

    def update_plugin(self, confirm: str) -> dict[str, Any]:
        """Update this plugin after an explicit yes/no confirmation in Desktop."""

        self._confirm(confirm, PLUGIN_ID)
        with self._plugin_update_lock:
            result = self._run_external(lambda: self.runtime.update_plugin(
                PLUGIN_ID,
                self.paths.plugin_root,
                self.paths.desktop_plugin_entry,
            ))
        self._record("plugin-update", {"name": PLUGIN_ID, "kind": "plugin"})
        return result

    def delete_codex(self, name: str, relative_path: str, confirm: str) -> dict[str, Any]:
        """Delete one discovered Codex user skill without exposing system skills."""

        self._confirm(confirm, name)
        with self._sync_lock:
            row = self.inventory_reader.find_codex_user(relative_path, name)
            target = self.inventory_reader.safe_codex_relative_target(row["relativePath"])
            if target.is_symlink() or not target.is_dir() or not (target / "SKILL.md").is_file():
                raise SkillManagerError(404, "Codex 用户技能目录不存在")
            shutil.rmtree(target)
        self._record("delete-codex", row)
        return {"ok": True, "skill": row}

    def delete_qwenwork(self, name: str, relative_path: str, confirm: str) -> dict[str, Any]:
        """Delete one QwenWork user skill after exact-name confirmation."""

        self._confirm(confirm, name)
        with self._sync_lock:
            row = self.inventory_reader.find_qwenwork_user(relative_path, name)
            target = self.inventory_reader.safe_qwenwork_relative_target(row["relativePath"])
            if target.is_symlink() or not target.is_dir() or not (target / "SKILL.md").is_file():
                raise SkillManagerError(404, "千问办公技能目录不存在")
            shutil.rmtree(target)
        self._record("delete-qwen", row)
        return {"ok": True, "skill": row}

    def delete_workbuddy(self, name: str, relative_path: str, confirm: str) -> dict[str, Any]:
        """Delete one WorkBuddy user skill after exact-name confirmation."""

        self._confirm(confirm, name)
        with self._sync_lock:
            row = self.inventory_reader.find_workbuddy_user(relative_path, name)
            target = self.inventory_reader.safe_workbuddy_relative_target(row["relativePath"])
            if target.is_symlink() or not target.is_dir() or not (target / "SKILL.md").is_file():
                raise SkillManagerError(404, "WorkBuddy 技能目录不存在")
            shutil.rmtree(target)
        self._record("delete-workbuddy", row)
        return {"ok": True, "skill": row}

    def sync_codex(
        self,
        source: str,
        name: str,
        confirm: str = "",
        force: bool = False,
    ) -> dict[str, Any]:
        row = self.inventory_reader.find(source, name)
        if self._kind(row) not in {"builtin", "hub-installed", "local"}:
            raise SkillManagerError(400, "该类型的 Hermes 技能不允许同步到 Codex")
        source_path = self.inventory_reader.safe_target(row["installPath"])
        target = self.inventory_reader.safe_codex_target(row["name"], create_root=True)
        if force:
            self._confirm(confirm, row["name"])
        try:
            with self._sync_lock:
                copy_skill(source_path, target, force=force)
        except SkillManagerError:
            raise
        except Exception as exc:
            raise SkillManagerError(500, f"同步到 Codex 失败：{exc}") from exc
        self._record("sync-codex", row)
        return {"ok": True, "skill": row, "codexPath": str(target)}
