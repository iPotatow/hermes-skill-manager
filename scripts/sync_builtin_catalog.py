#!/usr/bin/env python3
"""Regenerate the bundled fallback from Hermes' official Chinese docs page."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = ROOT / "dashboard"
sys.path.insert(0, str(DASHBOARD))

from skill_manager.catalog import (  # noqa: E402
    OFFICIAL_CATALOG_URL,
    fetch_official_catalog,
    parse_official_catalog,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--html-file",
        type=Path,
        help="parse a downloaded page instead of requesting the official URL",
    )
    args = parser.parse_args()
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
    target = DASHBOARD / "data" / "builtin_catalog.json"
    target.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"已从 Hermes 官方中文目录同步 {len(skills)} 条技能简介：{target}")


if __name__ == "__main__":
    main()
