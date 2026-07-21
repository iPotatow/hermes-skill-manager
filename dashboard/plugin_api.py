"""Skill manage dashboard plugin API.

Mounted by the Hermes gateway at /api/plugins/desktop-skill-manager/.
"""

from __future__ import annotations

import json
import os
import shutil
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

try:
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel
except Exception:
    class APIRouter:  # type: ignore
        def get(self, *_args, **_kwargs):
            return lambda fn: fn

        def post(self, *_args, **_kwargs):
            return lambda fn: fn

    class HTTPException(Exception):  # type: ignore
        def __init__(self, status_code: int, detail: str):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    class BaseModel:  # type: ignore
        pass

try:
    from hermes_constants import get_hermes_home
except Exception:
    def get_hermes_home() -> Path:  # type: ignore[misc]
        return Path.home() / ".hermes"

router = APIRouter()

PLUGIN_ROOT = Path(__file__).resolve().parents[1]
LEGACY_STATE_PATH = PLUGIN_ROOT / "state.json"
BUILTIN_CATALOG_PATH = PLUGIN_ROOT / "dashboard" / "data" / "builtin_catalog.json"
_BUILTIN_CATALOG_CACHE: Tuple[int, Dict[str, Dict[str, str]]] = (-1, {})
_STATE_LOCK = threading.RLock()
_SYNC_LOCK = threading.RLock()


class SkillAction(BaseModel):
    source: str = ""
    name: str = ""
    confirm: str = ""
    category: str = ""
    force: bool = False


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _home() -> Path:
    return Path(get_hermes_home())


def _skills_dir() -> Path:
    try:
        from tools.skills_tool import _skills_dir as resolve_skills_dir
        return Path(resolve_skills_dir())
    except Exception:
        return _home() / "skills"


def _codex_home() -> Path:
    configured = os.environ.get("CODEX_HOME", "").strip()
    return Path(configured).expanduser() if configured else Path.home() / ".codex"


def _codex_skills_dir() -> Path:
    return _codex_home() / "skills"


def _frontmatter_value(content: str, key: str) -> str:
    lines = content.splitlines()
    if not lines or lines[0].strip() != "---":
        return ""
    for line in lines[1:]:
        if line.strip() == "---":
            break
        if line.startswith(f"{key}:"):
            value = line.split(":", 1)[1].strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
                value = value[1:-1]
            return value
    return ""


def _codex_inventory(diagnostics: Optional[List[Dict[str, str]]] = None) -> List[Dict[str, Any]]:
    root = _codex_skills_dir().expanduser()
    if not root.exists():
        return []
    root = root.resolve()
    rows: List[Dict[str, Any]] = []
    for skill_md in sorted(root.rglob("SKILL.md")):
        try:
            if skill_md.is_symlink() or not skill_md.is_file():
                continue
            resolved = skill_md.resolve()
            if not resolved.is_relative_to(root):
                continue
            relative_dir = resolved.parent.relative_to(root)
            content = resolved.read_text(encoding="utf-8")
            name = _frontmatter_value(content, "name") or resolved.parent.name
            description = _frontmatter_value(content, "description")
            rows.append({
                "name": name,
                "description": description[:500],
                "kind": "system" if relative_dir.parts and relative_dir.parts[0] == ".system" else "user",
                "path": str(resolved.parent),
                "relativePath": relative_dir.as_posix(),
                "updatedAt": datetime.fromtimestamp(resolved.stat().st_mtime, timezone.utc).isoformat(),
            })
        except Exception as exc:
            if diagnostics is not None:
                diagnostics.append({"component": "codex-skill", "message": str(exc) or exc.__class__.__name__})
    return sorted(rows, key=lambda row: (row["kind"], str(row["name"]).lower(), row["relativePath"]))


def _state_path() -> Path:
    """Keep mutable data outside the possibly read-only plugin installation."""
    return _home() / "state" / "plugins" / "desktop-skill-manager.json"


def _load_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def _capture(
    component: str,
    loader: Callable[[], Any],
    fallback: Any,
    diagnostics: Optional[List[Dict[str, str]]] = None,
) -> Any:
    try:
        return loader()
    except Exception as exc:
        if diagnostics is not None:
            diagnostics.append({"component": component, "message": str(exc) or exc.__class__.__name__})
        return fallback


def _load_builtin_catalog() -> Dict[str, Dict[str, str]]:
    global _BUILTIN_CATALOG_CACHE
    try:
        modified = BUILTIN_CATALOG_PATH.stat().st_mtime_ns
    except OSError:
        return {}
    if _BUILTIN_CATALOG_CACHE[0] == modified:
        return _BUILTIN_CATALOG_CACHE[1]
    data = _load_json(BUILTIN_CATALOG_PATH, {})
    skills = data.get("skills", {}) if isinstance(data, dict) else {}
    if not isinstance(skills, dict):
        skills = {}
    _BUILTIN_CATALOG_CACHE = (modified, skills)
    return skills


def _load_state() -> Dict[str, Any]:
    path = _state_path()
    data = _load_json(path, None)
    if data is None and LEGACY_STATE_PATH.exists():
        data = _load_json(LEGACY_STATE_PATH, None)
    if data is None:
        data = {"version": 1, "history": []}
    if not isinstance(data, dict):
        data = {"version": 1, "history": []}
    data.setdefault("version", 1)
    data.setdefault("history", [])
    if not isinstance(data["history"], list):
        data["history"] = []
    return data


def _save_state(state: Dict[str, Any]) -> None:
    path = _state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def _history(event: Dict[str, Any]) -> None:
    with _STATE_LOCK:
        state = _load_state()
        event.setdefault("at", _now())
        state.setdefault("history", []).insert(0, event)
        state["history"] = state["history"][:200]
        _save_state(state)


def _record_history(event: Dict[str, Any]) -> None:
    """History is useful telemetry and must not turn a completed action into an error."""
    try:
        _history(event)
    except Exception:
        pass


def _clear_skill_cache() -> None:
    try:
        from agent.prompt_builder import clear_skills_system_prompt_cache
        clear_skills_system_prompt_cache(clear_snapshot=True)
    except Exception:
        pass


def _hub_by_name(diagnostics: Optional[List[Dict[str, str]]] = None) -> Dict[str, Dict[str, Any]]:
    def load() -> Dict[str, Dict[str, Any]]:
        from tools.skills_hub import HubLockFile
        return {entry["name"]: entry for entry in HubLockFile().list_installed()}

    return _capture("hub-lock", load, {}, diagnostics)


def _builtin_names(diagnostics: Optional[List[Dict[str, str]]] = None) -> set[str]:
    def load() -> set[str]:
        from tools.skills_sync import _read_manifest
        return set(_read_manifest())

    return _capture("builtin-manifest", load, set(), diagnostics)


def _bundled_skills(diagnostics: Optional[List[Dict[str, str]]] = None) -> List[Tuple[str, Path, str]]:
    def load() -> List[Tuple[str, Path, str]]:
        from tools.skills_sync import _discover_bundled_skills, _get_bundled_dir
        bundled_dir = _get_bundled_dir()
        rows: List[Tuple[str, Path, str]] = []
        for name, skill_dir in _discover_bundled_skills(bundled_dir):
            install_path = skill_dir.relative_to(bundled_dir).as_posix()
            rows.append((name, skill_dir, install_path))
        return rows

    return _capture("bundled-skills", load, [], diagnostics)


def _disabled_names(diagnostics: Optional[List[Dict[str, str]]] = None) -> set[str]:
    def load() -> set[str]:
        from agent.skill_utils import get_disabled_skill_names
        return set(get_disabled_skill_names())

    return _capture("disabled-skills", load, set(), diagnostics)


def _all_skills(diagnostics: Optional[List[Dict[str, str]]] = None) -> List[Dict[str, Any]]:
    def load() -> List[Dict[str, Any]]:
        from tools.skills_tool import _find_all_skills
        return list(_find_all_skills(skip_disabled=True))

    return _capture("skill-discovery", load, [], diagnostics)


def _read_skill_description(skill_dir: Path) -> str:
    try:
        from tools.skills_tool import _parse_frontmatter
        content = (skill_dir / "SKILL.md").read_text(encoding="utf-8")
        frontmatter, _body = _parse_frontmatter(content)
        return str(frontmatter.get("description", "") or "")
    except Exception:
        return ""


def _builtin_description(name: str, fallback: str = "") -> str:
    entry = _load_builtin_catalog().get(name, {})
    description = entry.get("descriptionZh")
    return description if isinstance(description, str) and description else fallback


def _builtin_description_en(name: str, fallback: str = "") -> str:
    entry = _load_builtin_catalog().get(name, {})
    description = entry.get("descriptionEn")
    return description if isinstance(description, str) and description else fallback


def _available_actions(row: Dict[str, Any]) -> List[str]:
    if row.get("status") == "deleted":
        return ["restore"] if row.get("kind") == "builtin" else []
    kind = row.get("kind") or row.get("source")
    if kind == "builtin":
        return ["reset", "delete"]
    if kind == "hub-installed":
        return ["reset", "update", "delete"]
    if kind == "local":
        return ["delete"]
    return []


def _safe_target(rel_path: str) -> Path:
    root = _skills_dir().resolve()
    target = (root / rel_path).resolve()
    if target == root or not target.is_relative_to(root):
        raise HTTPException(status_code=400, detail="技能路径不安全")
    return target


def _safe_codex_target(name: str, create_root: bool = False) -> Path:
    if not name or name in {".", ".."} or Path(name).name != name or "/" in name or "\\" in name:
        raise HTTPException(status_code=400, detail="Codex 技能名不安全")
    root = _codex_skills_dir().expanduser()
    if create_root:
        root.mkdir(parents=True, exist_ok=True)
    root = root.resolve()
    target = root / name
    if target.is_symlink():
        raise HTTPException(status_code=400, detail="Codex 技能目标不能是符号链接")
    resolved = target.resolve()
    if resolved == root or not resolved.is_relative_to(root):
        raise HTTPException(status_code=400, detail="Codex 技能路径不安全")
    return target


def _validate_sync_source(source: Path) -> None:
    if not source.is_dir() or not (source / "SKILL.md").is_file():
        raise HTTPException(status_code=400, detail="Hermes 技能缺少 SKILL.md，无法同步到 Codex")
    for item in source.rglob("*"):
        if item.is_symlink():
            raise HTTPException(status_code=400, detail=f"技能包含符号链接，无法安全同步：{item.name}")
        if not item.is_dir() and not item.is_file():
            raise HTTPException(status_code=400, detail=f"技能包含不支持的特殊文件：{item.name}")


def _codex_fields(row: Dict[str, Any]) -> Dict[str, Any]:
    if (row.get("kind") or row.get("source")) not in {"hub-installed", "local"} or row.get("status") == "deleted":
        return {"codexInstalled": False, "codexPath": ""}
    try:
        target = _safe_codex_target(str(row.get("name", "")))
        installed = target.exists()
        return {"codexInstalled": installed, "codexPath": str(target)}
    except Exception:
        return {"codexInstalled": False, "codexPath": ""}


def _copy_skill_to_codex(source: Path, target: Path, force: bool = False) -> None:
    _validate_sync_source(source)
    if target.exists() and not target.is_dir():
        raise HTTPException(status_code=409, detail="Codex 目标已存在且不是技能目录")
    if target.exists() and not force:
        raise HTTPException(status_code=409, detail="Codex 中已存在同名技能；确认覆盖后才能重新同步")

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


def _normalize_path(path_value: Any, name: str, category: str) -> str:
    if isinstance(path_value, str) and path_value:
        try:
            path = Path(path_value)
            root = _skills_dir().resolve()
            if path.is_absolute():
                return path.resolve().relative_to(root).as_posix()
        except Exception:
            pass
    return f"{category}/{name}" if category else name


def _skill_row(skill: Dict[str, Any], hub: Dict[str, Dict[str, Any]], builtin: set[str], disabled: set[str], bundled_names: set[str]) -> Dict[str, Any]:
    name = skill["name"]
    category = skill.get("category", "") or ""
    hub_entry = hub.get(name)
    skill_md_path = skill.get("skill_md_path") or skill.get("path") or ""
    install_path = _normalize_path(skill_md_path, name, category)

    if hub_entry:
        kind = "hub-installed"
        source = hub_entry.get("source", "hub")
        trust = hub_entry.get("trust_level", "community")
        identifier = hub_entry.get("identifier", "")
        installed_at = str(hub_entry.get("installed_at", ""))[:10]
        updated_at = str(hub_entry.get("updated_at", ""))[:10]
    elif name in builtin and name in bundled_names:
        kind = "builtin"
        source = "builtin"
        trust = "builtin"
        identifier = f"bundled/{install_path}"
        installed_at = ""
        updated_at = ""
    else:
        kind = "local"
        source = "local"
        trust = "local"
        identifier = ""
        installed_at = ""
        updated_at = ""

    description_en = skill.get("description", "") or ""
    description = description_en
    if kind == "builtin":
        description = _builtin_description(name, description_en)
        description_en = _builtin_description_en(name, description_en)

    row = {
        "name": name,
        "category": category,
        "kind": kind,
        "source": source,
        "rawSource": source,
        "trustLevel": "official" if source == "official" else trust,
        "status": "disabled" if name in disabled else "enabled",
        "installPath": install_path,
        "identifier": identifier,
        "description": description,
        "descriptionZh": description,
        "descriptionEn": description_en,
        "installedAt": installed_at,
        "updatedAt": updated_at,
    }
    row["availableActions"] = _available_actions(row)
    row.update(_codex_fields(row))
    return row


def _inventory_rows(
    bundled_names: set[str],
    diagnostics: Optional[List[Dict[str, str]]] = None,
) -> List[Dict[str, Any]]:
    hub = _hub_by_name(diagnostics)
    builtin = _builtin_names(diagnostics)
    disabled = _disabled_names(diagnostics)
    rows = [
        _skill_row(skill, hub, builtin, disabled, bundled_names)
        for skill in _all_skills(diagnostics)
    ]
    return sorted(rows, key=lambda row: (row.get("category") or "", row["name"]))


def _missing_builtin_rows(
    current_rows: List[Dict[str, Any]],
    bundled: Optional[List[Tuple[str, Path, str]]] = None,
) -> List[Dict[str, Any]]:
    current_names = {row["name"] for row in current_rows}
    rows: List[Dict[str, Any]] = []
    for name, skill_dir, install_path in bundled if bundled is not None else _bundled_skills():
        if name in current_names:
            continue
        category = str(Path(install_path).parent)
        if category == ".":
            category = ""
        description = _builtin_description(name, _read_skill_description(skill_dir))
        description_en = _builtin_description_en(name, _read_skill_description(skill_dir))
        row = {
            "name": name,
            "category": category,
            "kind": "builtin",
            "source": "builtin",
            "rawSource": "builtin",
            "trustLevel": "builtin",
            "status": "deleted",
            "installPath": install_path,
            "identifier": f"bundled/{install_path}",
            "description": description,
            "descriptionZh": description,
            "descriptionEn": description_en,
            "installedAt": "",
            "updatedAt": "",
            "canRestore": True,
        }
        row["availableActions"] = _available_actions(row)
        rows.append(row)
    return sorted(rows, key=lambda row: (row.get("category") or "", row["name"]))


def _find_skill(source: str, name: str) -> Dict[str, Any]:
    diagnostics: List[Dict[str, str]] = []
    bundled = _bundled_skills(diagnostics)
    bundled_names = {item[0] for item in bundled}
    for row in _inventory_rows(bundled_names, diagnostics):
        if (row.get("kind") or row["source"]) == source and row["name"] == name:
            return row
    if diagnostics:
        detail = "; ".join(f"{item['component']}: {item['message']}" for item in diagnostics)
        raise HTTPException(status_code=503, detail=f"技能数据加载失败：{detail}")
    raise HTTPException(status_code=404, detail=f"未找到技能：{source}:{name}")


def _find_missing_builtin(name: str) -> Dict[str, Any]:
    diagnostics: List[Dict[str, str]] = []
    bundled = _bundled_skills(diagnostics)
    bundled_names = {item[0] for item in bundled}
    rows = _inventory_rows(bundled_names, diagnostics)
    for row in _missing_builtin_rows(rows, bundled):
        if row["name"] == name:
            return row
    if diagnostics:
        detail = "; ".join(f"{item['component']}: {item['message']}" for item in diagnostics)
        raise HTTPException(status_code=503, detail=f"技能数据加载失败：{detail}")
    raise HTTPException(status_code=404, detail=f"未找到可恢复的内建技能：{name}")


def _require_confirm(action: SkillAction, name: str) -> None:
    if action.confirm != name:
        raise HTTPException(status_code=400, detail="二次确认失败：确认文本必须与技能名一致")


@router.get("/inventory")
async def inventory() -> Dict[str, Any]:
    diagnostics: List[Dict[str, str]] = []
    bundled = _bundled_skills(diagnostics)
    bundled_names = {item[0] for item in bundled}
    rows = _inventory_rows(bundled_names, diagnostics)
    missing_builtin = _missing_builtin_rows(rows, bundled)
    state = _load_state()
    codex_skills = _codex_inventory(diagnostics)
    counts: Dict[str, int] = {}
    enabled_count = 0
    disabled_count = 0
    categories: Dict[str, int] = {}
    for row in rows:
        kind = row.get("kind") or row["source"]
        counts[kind] = counts.get(kind, 0) + 1
        categories[row.get("category") or "(root)"] = categories.get(row.get("category") or "(root)", 0) + 1
        if row["status"] == "enabled":
            enabled_count += 1
        else:
            disabled_count += 1
    return {
        "ok": True,
        "skills": rows,
        "missingBuiltinSkills": missing_builtin,
        "counts": counts,
        "missingBuiltinCount": len(missing_builtin),
        "enabledCount": enabled_count,
        "disabledCount": disabled_count,
        "categories": categories,
        "history": state.get("history", [])[:5],
        "codexSkills": codex_skills,
        "codexSkillCount": len(codex_skills),
        "diagnostics": diagnostics,
        "meta": {
            "home": str(_home()),
            "skillsDir": str(_skills_dir()),
            "codexSkillsDir": str(_codex_skills_dir()),
            "generatedAt": _now(),
            "partial": bool(diagnostics),
        },
    }


@router.post("/delete")
async def delete_skill(action: SkillAction) -> Dict[str, Any]:
    name = action.name
    source = action.source
    _require_confirm(action, name)
    row = _find_skill(source, name)

    if row.get("kind") == "hub-installed":
        try:
            from tools.skills_hub import uninstall_skill
            ok, message = uninstall_skill(row["name"])
            if not ok:
                raise HTTPException(status_code=500, detail=message)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
    else:
        target = _safe_target(row["installPath"])
        if not target.exists():
            raise HTTPException(status_code=404, detail="技能路径不存在")
        shutil.rmtree(target)

    _clear_skill_cache()
    _record_history({"action": "delete", "source": row.get("kind", row["source"]), "name": row["name"]})
    return {"ok": True, "skill": row}


@router.post("/reset")
async def reset_skill(action: SkillAction) -> Dict[str, Any]:
    name = action.name
    source = action.source
    _require_confirm(action, name)
    row = _find_skill(source, name)

    if row.get("kind") == "builtin":
        try:
            from hermes_cli.skills_hub import do_reset
            do_reset(row["name"], restore=True, console=None, skip_confirm=True)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
    elif row.get("kind") == "hub-installed":
        if not row.get("identifier"):
            raise HTTPException(status_code=400, detail="该 hub 技能缺少来源标识，无法重置")
        try:
            from hermes_cli.skills_hub import do_install
            do_install(row["identifier"], category=row.get("category", ""), force=True, console=None, skip_confirm=True)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
    else:
        raise HTTPException(status_code=400, detail="本地技能不支持重置")

    _clear_skill_cache()
    _record_history({"action": "reset", "source": row.get("kind", row["source"]), "name": row["name"]})
    return {"ok": True, "skill": row}


@router.post("/restore")
async def restore_builtin(action: SkillAction) -> Dict[str, Any]:
    row = _find_missing_builtin(action.name)
    try:
        from tools.skills_sync import reset_bundled_skill
        result = reset_bundled_skill(row["name"], restore=True)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if not result.get("ok"):
        raise HTTPException(status_code=500, detail=result.get("message", "恢复内建技能失败"))
    _clear_skill_cache()
    _record_history({"action": "restore", "source": "builtin", "name": row["name"]})
    return {"ok": True, "skill": row, "result": result}


@router.post("/update")
async def update_skill(action: SkillAction) -> Dict[str, Any]:
    row = _find_skill("hub-installed", action.name)
    try:
        from hermes_cli.skills_hub import do_update
        do_update(name=row["name"], console=None)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    _clear_skill_cache()
    _record_history({"action": "update", "source": row.get("kind", row["source"]), "name": row["name"]})
    return {"ok": True, "skill": row}


@router.post("/sync-codex")
async def sync_skill_to_codex(action: SkillAction) -> Dict[str, Any]:
    row = _find_skill(action.source, action.name)
    if (row.get("kind") or row.get("source")) not in {"hub-installed", "local"}:
        raise HTTPException(status_code=400, detail="只有 Hermes 社区或本地技能可以同步到 Codex")
    source = _safe_target(row["installPath"])
    target = _safe_codex_target(row["name"], create_root=True)
    if action.force:
        _require_confirm(action, row["name"])
    try:
        with _SYNC_LOCK:
            _copy_skill_to_codex(source, target, force=bool(action.force))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"同步到 Codex 失败：{exc}") from exc
    _record_history({"action": "sync-codex", "source": row.get("kind", row["source"]), "name": row["name"]})
    return {"ok": True, "skill": row, "codexPath": str(target)}
