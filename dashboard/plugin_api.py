"""Thin FastAPI adapter for the Skill Manager service."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Callable, TypeVar

try:
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel
except Exception:  # pragma: no cover - source-only environments
    class APIRouter:  # type: ignore[no-redef]
        def get(self, *_args, **_kwargs): return lambda function: function
        def post(self, *_args, **_kwargs): return lambda function: function

    class HTTPException(Exception):  # type: ignore[no-redef]
        def __init__(self, status_code: int, detail: str):
            super().__init__(detail); self.status_code = status_code; self.detail = detail

    class BaseModel:  # type: ignore[no-redef]
        def __init__(self, **values):
            for key, value in values.items(): setattr(self, key, value)

_DASHBOARD_DIR = Path(__file__).resolve().parent
_ADDED_DASHBOARD_PATH = str(_DASHBOARD_DIR) not in sys.path
if _ADDED_DASHBOARD_PATH: sys.path.insert(0, str(_DASHBOARD_DIR))
try:
    from skill_manager.errors import SkillManagerError
    from skill_manager.service import SkillManager
finally:
    if _ADDED_DASHBOARD_PATH: sys.path.remove(str(_DASHBOARD_DIR))

router = APIRouter()
Result = TypeVar("Result")


class SkillAction(BaseModel):
    source: str = ""
    name: str = ""
    confirm: str = ""
    relative_path: str = ""
    target_agent: str = ""
    force: bool = False


def _manager() -> SkillManager:
    return SkillManager()


def _run(operation: Callable[[], Result]) -> Result:
    try:
        return operation()
    except SkillManagerError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get("/inventory")
async def inventory() -> dict[str, Any]:
    return _run(lambda: _manager().inventory())


@router.post("/delete")
def delete_skill(a: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().delete(a.source, a.name, a.confirm))


@router.post("/reset")
def reset_skill(a: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().reset(a.source, a.name, a.confirm))


@router.post("/restore")
def restore_builtin(a: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().restore(a.name))


@router.post("/update")
def update_skill(a: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().update(a.name))


@router.post("/plugin-update")
def update_plugin(a: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().update_plugin(a.confirm))


@router.post("/delete-codex")
def delete_codex_skill(a: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().delete_codex(a.name, a.relative_path, a.confirm))


@router.post("/delete-qwen")
def delete_qwen_skill(a: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().delete_qwenwork(a.name, a.relative_path, a.confirm))


@router.post("/delete-workbuddy")
def delete_workbuddy_skill(a: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().delete_workbuddy(a.name, a.relative_path, a.confirm))


@router.post("/link-agent")
def link_skill_to_agent(a: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().link_agent(
        a.source, a.name, a.target_agent, a.relative_path, a.confirm, a.force
    ))


@router.post("/unlink-agent")
def unlink_skill_from_agent(a: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().unlink_agent(a.source, a.name, a.target_agent, a.relative_path))


@router.post("/link-qwen")
def link_skill_to_qwenwork(a: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().link_qwenwork(a.source, a.name, a.confirm, a.force))


@router.post("/link-workbuddy")
def link_skill_to_workbuddy(a: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().link_workbuddy(a.source, a.name, a.confirm, a.force))


@router.post("/sync-codex")
def sync_skill_to_codex(a: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().sync_codex(a.source, a.name, a.confirm, a.force))
