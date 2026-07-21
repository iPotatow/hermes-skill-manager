"""Safe filesystem primitives for Hermes and Codex skill trees."""

from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path

from .errors import SkillManagerError


def copy_file_atomic(source: Path, target: Path) -> None:
    """Replace one regular file without exposing a partially copied target."""

    source = Path(source)
    target = Path(target)
    if source.is_symlink() or not source.is_file():
        raise SkillManagerError(500, "更新包缺少有效的 Desktop 插件入口")
    if target.exists() and target.is_dir():
        raise SkillManagerError(500, "Desktop 插件入口被目录占用")

    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.parent / f".{target.name}.{uuid.uuid4().hex}.tmp"
    try:
        shutil.copy2(source, temporary)
        os.replace(temporary, target)
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


def safe_descendant(root: Path, relative_path: str, detail: str) -> Path:
    """Return a non-symlink descendant of root or reject the path."""

    relative = Path(relative_path)
    if not relative_path or relative.is_absolute() or any(part in {".", ".."} for part in relative.parts):
        raise SkillManagerError(400, detail)

    resolved_root = Path(root).expanduser().resolve()
    target = resolved_root.joinpath(relative)
    resolved_target = target.resolve(strict=False)
    if resolved_target == resolved_root or not resolved_target.is_relative_to(resolved_root):
        raise SkillManagerError(400, detail)

    cursor = resolved_root
    for part in relative.parts:
        cursor = cursor / part
        if cursor.is_symlink():
            raise SkillManagerError(400, detail)
    return target


def safe_named_descendant(root: Path, name: str, detail: str, create_root: bool = False) -> Path:
    """Resolve one direct child while rejecting separators and symlinks."""

    if not name or name in {".", ".."} or Path(name).name != name or "/" in name or "\\" in name:
        raise SkillManagerError(400, detail)
    expanded_root = Path(root).expanduser()
    if create_root:
        expanded_root.mkdir(parents=True, exist_ok=True)
    return safe_descendant(expanded_root, name, detail)


def validate_sync_source(source: Path) -> None:
    if source.is_symlink() or not source.is_dir() or not (source / "SKILL.md").is_file():
        raise SkillManagerError(400, "Hermes 技能缺少 SKILL.md，无法同步到 Codex")
    for item in source.rglob("*"):
        if item.is_symlink():
            raise SkillManagerError(400, f"技能包含符号链接，无法安全同步：{item.name}")
        if not item.is_dir() and not item.is_file():
            raise SkillManagerError(400, f"技能包含不支持的特殊文件：{item.name}")


def copy_skill(source: Path, target: Path, force: bool = False) -> None:
    """Atomically install a complete Hermes skill into Codex."""

    validate_sync_source(source)
    if target.is_symlink():
        raise SkillManagerError(400, "Codex 技能目标不能是符号链接")
    if target.exists() and not target.is_dir():
        raise SkillManagerError(409, "Codex 目标已存在且不是技能目录")
    if target.exists() and not force:
        raise SkillManagerError(409, "Codex 中已存在同名技能；确认覆盖后才能重新同步")

    temporary = target.parent / f".{target.name}.{uuid.uuid4().hex}.tmp"
    backup = target.parent / f".{target.name}.{uuid.uuid4().hex}.bak"
    replaced = False
    try:
        shutil.copytree(source, temporary)
        if target.exists():
            os.replace(target, backup)
            replaced = True
        os.replace(temporary, target)
        if backup.exists():
            shutil.rmtree(backup, ignore_errors=True)
    except Exception:
        if temporary.exists():
            shutil.rmtree(temporary, ignore_errors=True)
        if replaced and backup.exists() and not target.exists():
            os.replace(backup, target)
        raise
