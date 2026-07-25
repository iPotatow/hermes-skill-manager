#!/usr/bin/env python3
"""Synchronize built-in skill Chinese descriptions from hermes-agent."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = ROOT / "dashboard"
DEFAULT_CATALOG = DASHBOARD / "data" / "builtin_catalog.json"
sys.path.insert(0, str(DASHBOARD))

from skill_manager.catalog import (  # noqa: E402
    OFFICIAL_CATALOG_URL,
    fetch_official_catalog,
    parse_official_catalog,
)


CHINESE_RE = re.compile(r"[\u4e00-\u9fff]")
MARKDOWN_ROW_RE = re.compile(
    r"^\| \[`([^`]+)`\]\([^)]+\) \| (.+?) \| `([^`]+)` \|$",
    re.MULTILINE,
)
LOCAL_FALLBACKS = {
    "computer-use": "在后台操作用户桌面，包括点击、输入、滚动和拖拽，不抢占光标、键盘焦点或切换虚拟桌面。支持 macOS、Windows 和 Linux。",
    "docx": "创建、读取和编辑 Word .docx 文档及模板。",
    "pdf": "创建、合并、拆分、填写和保护 PDF 文件。",
    "simplify-code": "通过 4 个并行 agent 清理最近的代码变更。",
    "xlsx": "创建、读取和编辑 Excel .xlsx 电子表格及 CSV 文件。",
}


def parse_official_markdown(content: str) -> dict[str, dict[str, str]]:
    """Parse the source Markdown catalog into path-indexed translated rows."""

    rows = {
        install_path: {
            "name": name,
            "descriptionZh": description,
            "path": install_path,
        }
        for name, description, install_path in MARKDOWN_ROW_RE.findall(content)
    }
    if not rows:
        raise ValueError("Hermes 官方中文内建技能目录中没有可用条目")
    return rows


def discover_bundled_skills(hermes_root: Path) -> list[tuple[str, str]]:
    skills_root = hermes_root / "skills"
    if not skills_root.is_dir():
        raise ValueError(f"找不到 Hermes 内建技能目录：{skills_root}")
    rows = sorted({
        (skill_md.parent.name, skill_md.parent.relative_to(skills_root).as_posix())
        for skill_md in skills_root.rglob("SKILL.md")
        if skill_md.is_file()
    })
    if not rows:
        raise ValueError("Hermes 内建技能目录为空")
    return rows


def load_existing_catalog(catalog_path: Path) -> dict[str, dict[str, str]]:
    if not catalog_path.is_file():
        return {}
    document = json.loads(catalog_path.read_text(encoding="utf-8"))
    skills = document.get("skills", {})
    return skills if isinstance(skills, dict) else {}


def build_catalog(hermes_root: Path, catalog_path: Path) -> dict[str, object]:
    docs = (
        hermes_root
        / "website"
        / "i18n"
        / "zh-Hans"
        / "docusaurus-plugin-content-docs"
        / "current"
        / "reference"
        / "skills-catalog.md"
    )
    if not docs.is_file():
        raise ValueError(f"找不到 Hermes 内建技能中文文档：{docs}")
    official = parse_official_markdown(docs.read_text(encoding="utf-8"))
    existing = load_existing_catalog(catalog_path)
    skills: dict[str, dict[str, str]] = {}
    missing: list[str] = []
    official_count = 0

    for name, install_path in discover_bundled_skills(hermes_root):
        translated = official.get(install_path, {})
        description = str(translated.get("descriptionZh", ""))
        if description:
            official_count += 1
        else:
            description = LOCAL_FALLBACKS.get(name, "")
            if not description:
                current = existing.get(name, {})
                description = (
                    str(current.get("descriptionZh", ""))
                    if isinstance(current, dict)
                    else ""
                )
        if not description or not CHINESE_RE.search(description):
            missing.append(f"{name} ({install_path})")
            continue
        skills[name] = {
            "descriptionZh": description,
            "path": install_path,
        }

    if missing:
        joined = "\n".join(f"- {item}" for item in missing)
        raise ValueError(
            "以下新内建技能既没有官方中文译文，也没有本地中文回退：\n"
            f"{joined}\n请先在 LOCAL_FALLBACKS 或 builtin_catalog.json 中补充译文。"
        )

    return {
        "schemaVersion": 2,
        "source": OFFICIAL_CATALOG_URL,
        "officialTranslationCount": official_count,
        "fallbackTranslationCount": len(skills) - official_count,
        "skills": dict(sorted(skills.items())),
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
    source = parser.add_mutually_exclusive_group()
    source.add_argument(
        "--hermes-root",
        type=Path,
        help="NousResearch/hermes-agent checkout root",
    )
    source.add_argument(
        "--html-file",
        type=Path,
        help="parse a downloaded rendered docs page",
    )
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    args = parser.parse_args()

    if args.hermes_root:
        changed = sync_catalog(args.hermes_root.resolve(), args.catalog.resolve())
        document = json.loads(args.catalog.read_text(encoding="utf-8"))
        print(
            f"内建中文目录：{len(document['skills'])} 项，"
            f"官方 {document['officialTranslationCount']} 项，"
            f"本地回退 {document['fallbackTranslationCount']} 项，"
            f"{'已更新' if changed else '无变化'}。"
        )
        return

    skills = (
        parse_official_catalog(args.html_file.read_text(encoding="utf-8"))
        if args.html_file
        else fetch_official_catalog()
    )
    document = {
        "schemaVersion": 2,
        "source": OFFICIAL_CATALOG_URL,
        "skills": dict(sorted(skills.items())),
    }
    args.catalog.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"已从 Hermes 官方中文目录同步 {len(skills)} 条技能简介：{args.catalog}")


if __name__ == "__main__":
    main()
