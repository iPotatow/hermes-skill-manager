#!/usr/bin/env python3
"""Synchronize Optional skill Chinese descriptions from hermes-agent."""

from __future__ import annotations

import argparse
import ast
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT / "dashboard" / "data" / "optional_catalog.json"
SOURCE = (
    "https://github.com/NousResearch/hermes-agent/tree/main/"
    "website/i18n/zh-Hans/docusaurus-plugin-content-docs/current/"
    "user-guide/skills/optional"
)
CHINESE_RE = re.compile(r"[\u4e00-\u9fff]")
PATH_RE = re.compile(r"\| 路径 \| `optional-skills/([^`]+)` \|")


def _frontmatter_value(content: str, key: str) -> str:
    if not content.startswith("---\n"):
        return ""
    for line in content.splitlines()[1:]:
        if line.strip() == "---":
            break
        if not line.startswith(f"{key}:"):
            continue
        raw = line.split(":", 1)[1].strip()
        if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in {'"', "'"}:
            try:
                value = ast.literal_eval(raw)
                return value if isinstance(value, str) else ""
            except (SyntaxError, ValueError):
                return raw[1:-1]
        return raw
    return ""


def discover_optional_identifiers(hermes_root: Path) -> set[str]:
    optional_root = hermes_root / "optional-skills"
    if not optional_root.is_dir():
        raise ValueError(f"找不到 Hermes Optional 技能目录：{optional_root}")
    identifiers = {
        f"official/{skill_md.parent.relative_to(optional_root).as_posix()}"
        for skill_md in optional_root.rglob("SKILL.md")
        if skill_md.is_file()
    }
    if not identifiers:
        raise ValueError("Hermes Optional 技能目录为空")
    return identifiers


def load_official_translations(hermes_root: Path) -> dict[str, str]:
    docs_root = (
        hermes_root
        / "website"
        / "i18n"
        / "zh-Hans"
        / "docusaurus-plugin-content-docs"
        / "current"
        / "user-guide"
        / "skills"
        / "optional"
    )
    if not docs_root.is_dir():
        raise ValueError(f"找不到 Hermes Optional 中文文档：{docs_root}")
    translations: dict[str, str] = {}
    for page in docs_root.rglob("*.md"):
        content = page.read_text(encoding="utf-8")
        path_match = PATH_RE.search(content)
        description = _frontmatter_value(content, "description").removesuffix("...")
        if path_match and description:
            translations[f"official/{path_match.group(1)}"] = description
    if not translations:
        raise ValueError("Hermes Optional 中文文档中没有可用译文")
    return translations


def load_existing_catalog(catalog_path: Path) -> dict[str, dict[str, str]]:
    if not catalog_path.is_file():
        return {}
    document = json.loads(catalog_path.read_text(encoding="utf-8"))
    skills = document.get("skills", {})
    return skills if isinstance(skills, dict) else {}


def build_catalog(hermes_root: Path, catalog_path: Path) -> dict[str, object]:
    identifiers = discover_optional_identifiers(hermes_root)
    official = load_official_translations(hermes_root)
    existing = load_existing_catalog(catalog_path)
    skills: dict[str, dict[str, str]] = {}
    missing: list[str] = []
    official_count = 0

    for identifier in sorted(identifiers):
        description = official.get(identifier, "")
        if description:
            official_count += 1
        else:
            current = existing.get(identifier, {})
            description = (
                str(current.get("descriptionZh", ""))
                if isinstance(current, dict)
                else ""
            )
        if not description or not CHINESE_RE.search(description):
            missing.append(identifier)
            continue
        skills[identifier] = {"descriptionZh": description}

    if missing:
        joined = "\n".join(f"- {identifier}" for identifier in missing)
        raise ValueError(
            "以下新技能既没有官方中文译文，也没有本地中文回退：\n"
            f"{joined}\n请先在 optional_catalog.json 中补充 descriptionZh。"
        )

    return {
        "schemaVersion": 1,
        "source": SOURCE,
        "officialTranslationCount": official_count,
        "fallbackTranslationCount": len(skills) - official_count,
        "skills": skills,
    }


def sync_catalog(hermes_root: Path, catalog_path: Path = DEFAULT_CATALOG) -> bool:
    document = build_catalog(hermes_root, catalog_path)
    rendered = json.dumps(document, ensure_ascii=False, indent=2) + "\n"
    previous = catalog_path.read_text(encoding="utf-8") if catalog_path.is_file() else ""
    if rendered == previous:
        return False
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    catalog_path.write_text(rendered, encoding="utf-8")
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--hermes-root",
        type=Path,
        required=True,
        help="NousResearch/hermes-agent checkout root",
    )
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    args = parser.parse_args()
    changed = sync_catalog(args.hermes_root.resolve(), args.catalog.resolve())
    document = json.loads(args.catalog.read_text(encoding="utf-8"))
    print(
        f"Optional 中文目录：{len(document['skills'])} 项，"
        f"官方 {document['officialTranslationCount']} 项，"
        f"本地回退 {document['fallbackTranslationCount']} 项，"
        f"{'已更新' if changed else '无变化'}。"
    )


if __name__ == "__main__":
    main()
