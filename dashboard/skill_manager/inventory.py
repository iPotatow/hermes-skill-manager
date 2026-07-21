"""Read-only Hermes/Codex skill discovery and API response shaping."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .catalog import BuiltinCatalog, shared_builtin_catalog
from .errors import SkillManagerError
from .filesystem import safe_descendant, safe_named_descendant
from .paths import SkillPaths


Diagnostic = dict[str, str]
BundledSkill = tuple[str, Path, str]


def capture(
    component: str,
    loader: Callable[[], Any],
    fallback: Any,
    diagnostics: list[Diagnostic],
) -> Any:
    """Collect a component failure while allowing a partial inventory."""

    try:
        return loader()
    except Exception as exc:
        diagnostics.append({
            "component": component,
            "message": str(exc) or exc.__class__.__name__,
        })
        return fallback


class SkillInventory:
    """Discover skill sources and normalize them into one stable contract."""

    def __init__(
        self,
        paths: SkillPaths,
        catalog_path: Path | None = None,
        catalog: BuiltinCatalog | None = None,
    ):
        self.paths = paths
        self.catalog_path = Path(catalog_path or paths.builtin_catalog)
        self.catalog = catalog or shared_builtin_catalog(self.catalog_path)

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
                if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
                    value = value[1:-1]
                return value
        return ""

    def _load_catalog(self) -> dict[str, dict[str, str]]:
        return self.catalog.snapshot()

    def _catalog_description(self, name: str, key: str, fallback: str = "") -> str:
        value = self._load_catalog().get(name, {}).get(key)
        return value if isinstance(value, str) and value else fallback

    def codex_inventory(self, diagnostics: list[Diagnostic]) -> list[dict[str, Any]]:
        """Return user-installed Codex skills; system skills stay private."""

        root = self.paths.codex_skills.expanduser()
        if not root.exists():
            return []
        root = root.resolve()
        rows: list[dict[str, Any]] = []
        for skill_md in sorted(root.rglob("SKILL.md")):
            try:
                if skill_md.is_symlink() or not skill_md.is_file():
                    continue
                resolved = skill_md.resolve()
                if not resolved.is_relative_to(root):
                    continue
                relative_dir = resolved.parent.relative_to(root)
                if not relative_dir.parts or relative_dir.parts[0] == ".system":
                    continue
                content = resolved.read_text(encoding="utf-8")
                rows.append({
                    "name": self._frontmatter_value(content, "name") or resolved.parent.name,
                    "description": self._frontmatter_value(content, "description")[:500],
                    "kind": "user",
                    "path": str(resolved.parent),
                    "relativePath": relative_dir.as_posix(),
                    "updatedAt": datetime.fromtimestamp(resolved.stat().st_mtime, timezone.utc).isoformat(),
                })
            except Exception as exc:
                diagnostics.append({
                    "component": "codex-skill",
                    "message": str(exc) or exc.__class__.__name__,
                })
        return sorted(rows, key=lambda row: (
            str(row["name"]).lower(),
            row["relativePath"],
        ))

    def hub_by_name(self, diagnostics: list[Diagnostic]) -> dict[str, dict[str, Any]]:
        def load() -> dict[str, dict[str, Any]]:
            from tools.skills_hub import HubLockFile

            return {entry["name"]: entry for entry in HubLockFile().list_installed()}

        return capture("hub-lock", load, {}, diagnostics)

    def builtin_names(self, diagnostics: list[Diagnostic]) -> set[str]:
        def load() -> set[str]:
            from tools.skills_sync import _read_manifest

            return set(_read_manifest())

        return capture("builtin-manifest", load, set(), diagnostics)

    def bundled_skills(self, diagnostics: list[Diagnostic]) -> list[BundledSkill]:
        def load() -> list[BundledSkill]:
            from tools.skills_sync import _discover_bundled_skills, _get_bundled_dir

            bundled_dir = _get_bundled_dir()
            return [
                (name, skill_dir, skill_dir.relative_to(bundled_dir).as_posix())
                for name, skill_dir in _discover_bundled_skills(bundled_dir)
            ]

        return capture("bundled-skills", load, [], diagnostics)

    def disabled_names(self, diagnostics: list[Diagnostic]) -> set[str]:
        def load() -> set[str]:
            from agent.skill_utils import get_disabled_skill_names

            return set(get_disabled_skill_names())

        return capture("disabled-skills", load, set(), diagnostics)

    def all_skills(self, diagnostics: list[Diagnostic]) -> list[dict[str, Any]]:
        def load() -> list[dict[str, Any]]:
            from tools.skills_tool import _find_all_skills

            # Hermes names this flag from the filtering implementation's point
            # of view: True means include disabled skills in the discovery set.
            return list(_find_all_skills(skip_disabled=True))

        return capture("skill-discovery", load, [], diagnostics)

    @staticmethod
    def available_actions(row: dict[str, Any]) -> list[str]:
        if row.get("status") == "deleted":
            return ["restore"] if row.get("kind") == "builtin" else []
        kind = row.get("kind") or row.get("source")
        return {
            "builtin": ["reset", "delete"],
            "hub-installed": ["reset", "update", "delete"],
            "local": ["delete"],
        }.get(kind, [])

    def safe_target(self, relative_path: str) -> Path:
        return safe_descendant(self.paths.skills, relative_path, "技能路径不安全")

    def safe_codex_target(self, name: str, create_root: bool = False) -> Path:
        return safe_named_descendant(
            self.paths.codex_skills,
            name,
            "Codex 技能名或路径不安全",
            create_root=create_root,
        )

    def safe_codex_relative_target(self, relative_path: str) -> Path:
        relative = Path(relative_path)
        if relative.parts and relative.parts[0] == ".system":
            raise SkillManagerError(400, "Codex 系统技能不允许删除")
        return safe_descendant(
            self.paths.codex_skills,
            relative_path,
            "Codex 技能路径不安全",
        )

    def find_codex_user(self, relative_path: str, name: str) -> dict[str, Any]:
        diagnostics: list[Diagnostic] = []
        for row in self.codex_inventory(diagnostics):
            if row["relativePath"] == relative_path and row["name"] == name:
                return row
        if diagnostics:
            raise self._discovery_error(diagnostics)
        raise SkillManagerError(404, f"未找到 Codex 用户技能：{name}")

    def _description_from_disk(self, skill_dir: Path) -> str:
        try:
            from tools.skills_tool import _parse_frontmatter

            content = (skill_dir / "SKILL.md").read_text(encoding="utf-8")
            frontmatter, _body = _parse_frontmatter(content)
            return str(frontmatter.get("description", "") or "")
        except Exception:
            return ""

    def _normalize_path(self, value: Any, name: str, category: str) -> str:
        if isinstance(value, str) and value:
            try:
                path = Path(value)
                root = self.paths.skills.resolve()
                if path.is_absolute():
                    return path.resolve().relative_to(root).as_posix()
            except Exception:
                pass
        return f"{category}/{name}" if category else name

    def _codex_fields(self, row: dict[str, Any]) -> dict[str, Any]:
        kind = row.get("kind") or row.get("source")
        if kind not in {"hub-installed", "local"} or row.get("status") == "deleted":
            return {"codexInstalled": False, "codexPath": ""}
        try:
            target = self.safe_codex_target(str(row.get("name", "")))
            return {"codexInstalled": target.exists(), "codexPath": str(target)}
        except Exception:
            return {"codexInstalled": False, "codexPath": ""}

    def _classify(
        self,
        name: str,
        install_path: str,
        hub_entry: dict[str, Any] | None,
        builtin_names: set[str],
        bundled_names: set[str],
    ) -> dict[str, str]:
        if hub_entry:
            source = str(hub_entry.get("source", "hub"))
            return {
                "kind": "hub-installed",
                "source": source,
                "trust": str(hub_entry.get("trust_level", "community")),
                "identifier": str(hub_entry.get("identifier", "")),
                "installedAt": str(hub_entry.get("installed_at", ""))[:10],
                "updatedAt": str(hub_entry.get("updated_at", ""))[:10],
            }
        if name in builtin_names and name in bundled_names:
            return {
                "kind": "builtin",
                "source": "builtin",
                "trust": "builtin",
                "identifier": f"bundled/{install_path}",
                "installedAt": "",
                "updatedAt": "",
            }
        return {
            "kind": "local",
            "source": "local",
            "trust": "local",
            "identifier": "",
            "installedAt": "",
            "updatedAt": "",
        }

    def _skill_row(
        self,
        skill: dict[str, Any],
        hub: dict[str, dict[str, Any]],
        builtin_names: set[str],
        disabled_names: set[str],
        bundled_names: set[str],
    ) -> dict[str, Any]:
        name = str(skill["name"])
        category = str(skill.get("category", "") or "")
        install_path = self._normalize_path(
            skill.get("skill_md_path") or skill.get("path") or "",
            name,
            category,
        )
        classification = self._classify(
            name,
            install_path,
            hub.get(name),
            builtin_names,
            bundled_names,
        )
        description_en = str(skill.get("description", "") or "")
        description_zh = description_en
        if classification["kind"] == "builtin":
            description_zh = self._catalog_description(name, "descriptionZh", description_en)
        source = classification["source"]
        row = {
            "name": name,
            "category": category,
            "kind": classification["kind"],
            "source": source,
            "rawSource": source,
            "trustLevel": "official" if source == "official" else classification["trust"],
            "status": "disabled" if name in disabled_names else "enabled",
            "installPath": install_path,
            "identifier": classification["identifier"],
            "description": description_zh,
            "descriptionZh": description_zh,
            "descriptionEn": description_en,
            "installedAt": classification["installedAt"],
            "updatedAt": classification["updatedAt"],
        }
        row["availableActions"] = self.available_actions(row)
        row.update(self._codex_fields(row))
        return row

    def rows(
        self,
        diagnostics: list[Diagnostic],
        bundled_names: set[str] | None = None,
    ) -> list[dict[str, Any]]:
        if bundled_names is None:
            bundled_names = {item[0] for item in self.bundled_skills(diagnostics)}
        hub = self.hub_by_name(diagnostics)
        builtin = self.builtin_names(diagnostics)
        disabled = self.disabled_names(diagnostics)
        rows = [
            self._skill_row(skill, hub, builtin, disabled, bundled_names)
            for skill in self.all_skills(diagnostics)
        ]
        return sorted(rows, key=lambda row: (row.get("category") or "", row["name"]))

    def missing_builtin_rows(
        self,
        current_rows: list[dict[str, Any]],
        bundled: list[BundledSkill],
    ) -> list[dict[str, Any]]:
        current_names = {row["name"] for row in current_rows}
        rows: list[dict[str, Any]] = []
        for name, skill_dir, install_path in bundled:
            if name in current_names:
                continue
            category = str(Path(install_path).parent)
            if category == ".":
                category = ""
            disk_description = self._description_from_disk(skill_dir)
            description_zh = self._catalog_description(name, "descriptionZh", disk_description)
            description_en = disk_description
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
                "description": description_zh,
                "descriptionZh": description_zh,
                "descriptionEn": description_en,
                "installedAt": "",
                "updatedAt": "",
                "canRestore": True,
            }
            row["availableActions"] = self.available_actions(row)
            rows.append(row)
        return sorted(rows, key=lambda row: (row.get("category") or "", row["name"]))

    @staticmethod
    def _discovery_error(diagnostics: list[Diagnostic]) -> SkillManagerError:
        detail = "; ".join(
            f"{item['component']}: {item['message']}"
            for item in diagnostics
        )
        return SkillManagerError(503, f"技能数据加载失败：{detail}")

    def find(self, source: str, name: str) -> dict[str, Any]:
        diagnostics: list[Diagnostic] = []
        bundled = self.bundled_skills(diagnostics)
        rows = self.rows(diagnostics, {item[0] for item in bundled})
        for row in rows:
            if (row.get("kind") or row["source"]) == source and row["name"] == name:
                return row
        if diagnostics:
            raise self._discovery_error(diagnostics)
        raise SkillManagerError(404, f"未找到技能：{source}:{name}")

    def find_missing_builtin(self, name: str) -> dict[str, Any]:
        diagnostics: list[Diagnostic] = []
        bundled = self.bundled_skills(diagnostics)
        current_rows = self.rows(diagnostics, {item[0] for item in bundled})
        for row in self.missing_builtin_rows(current_rows, bundled):
            if row["name"] == name:
                return row
        if diagnostics:
            raise self._discovery_error(diagnostics)
        raise SkillManagerError(404, f"未找到可恢复的内建技能：{name}")
