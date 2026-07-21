"""Narrow adapter around Hermes runtime operations."""

from __future__ import annotations

from typing import Any

from .errors import SkillManagerError


class HermesRuntime:
    """Invoke Hermes APIs without leaking them into domain orchestration."""

    @staticmethod
    def clear_skill_cache() -> None:
        try:
            from agent.prompt_builder import clear_skills_system_prompt_cache

            clear_skills_system_prompt_cache(clear_snapshot=True)
        except Exception:
            pass

    @staticmethod
    def uninstall(name: str) -> None:
        from tools.skills_hub import uninstall_skill

        ok, message = uninstall_skill(name)
        if not ok:
            raise SkillManagerError(500, message)

    @staticmethod
    def reset_builtin(name: str) -> None:
        from hermes_cli.skills_hub import do_reset

        do_reset(name, restore=True, console=None, skip_confirm=True)

    @staticmethod
    def reset_hub(identifier: str, category: str) -> None:
        from hermes_cli.skills_hub import do_install

        do_install(identifier, category=category, force=True, console=None, skip_confirm=True)

    @staticmethod
    def restore_builtin(name: str) -> dict[str, Any]:
        from tools.skills_sync import reset_bundled_skill

        return reset_bundled_skill(name, restore=True)

    @staticmethod
    def update_hub(name: str) -> None:
        from hermes_cli.skills_hub import do_update

        do_update(name=name, console=None)
