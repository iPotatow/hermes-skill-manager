"""FastAPI adapter for the Hermes Desktop skill manager.

Hermes imports this file directly from ``dashboard/manifest.json``. Business
rules live in ``skill_manager`` so this adapter only validates request
shape and translates expected failures into HTTP responses.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Callable, TypeVar

try:
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel
except Exception:  # pragma: no cover - source-only environments
    class APIRouter:  # type: ignore[no-redef]
        def get(self, *_args, **_kwargs):
            return lambda function: function

        def post(self, *_args, **_kwargs):
            return lambda function: function

    class HTTPException(Exception):  # type: ignore[no-redef]
        def __init__(self, status_code: int, detail: str):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    class BaseModel:  # type: ignore[no-redef]
        def __init__(self, **values):
            for key, value in values.items():
                setattr(self, key, value)


# spec_from_file_location does not guarantee that this directory is importable.
_DASHBOARD_DIR = Path(__file__).resolve().parent
_ADDED_DASHBOARD_PATH = str(_DASHBOARD_DIR) not in sys.path
if _ADDED_DASHBOARD_PATH:
    sys.path.insert(0, str(_DASHBOARD_DIR))
try:
    from skill_manager.errors import SkillManagerError
    from skill_manager.service import SkillManager
finally:
    if _ADDED_DASHBOARD_PATH:
        sys.path.remove(str(_DASHBOARD_DIR))


router = APIRouter()
Result = TypeVar("Result")


class SkillAction(BaseModel):
    source: str = ""
    name: str = ""
    confirm: str = ""
    relative_path: str = ""
    force: bool = False


def _manager() -> SkillManager:
    """Use a fresh service so profile and environment changes are observed."""

    return SkillManager()


def _run(operation: Callable[[], Result]) -> Result:
    try:
        return operation()
    except SkillManagerError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get("/inventory")
async def inventory() -> dict[str, Any]:
    return _run(lambda: _manager().inventory())


# Mutation handlers intentionally use ``def`` so FastAPI dispatches blocking
# Hub, Git, and filesystem work through its thread pool instead of the event loop.
@router.post("/delete")
def delete_skill(action: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().delete(action.source, action.name, action.confirm))


@router.post("/reset")
def reset_skill(action: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().reset(action.source, action.name, action.confirm))


@router.post("/restore")
def restore_builtin(action: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().restore(action.name))


@router.post("/update")
def update_skill(action: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().update(action.name))


@router.post("/plugin-update")
def update_plugin(action: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().update_plugin(action.confirm))


@router.post("/delete-codex")
def delete_codex_skill(action: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().delete_codex(
        action.name,
        action.relative_path,
        action.confirm,
    ))


@router.post("/sync-codex")
def sync_skill_to_codex(action: SkillAction) -> dict[str, Any]:
    return _run(lambda: _manager().sync_codex(
        action.source,
        action.name,
        getattr(action, "confirm", ""),
        getattr(action, "force", False),
    ))
