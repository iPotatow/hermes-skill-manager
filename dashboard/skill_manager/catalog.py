"""Official Chinese descriptions for Hermes bundled skills.

The committed catalog is an offline snapshot of the official documentation.
At runtime it is refreshed in the background, so inventory requests never wait
for the documentation site and remain fully functional without network access.
"""

from __future__ import annotations

import json
import threading
import time
from html.parser import HTMLParser
from pathlib import Path
from typing import Callable
from urllib.request import Request, urlopen


OFFICIAL_CATALOG_URL = (
    "https://hermes-agent.nousresearch.com/docs/zh-Hans/reference/skills-catalog"
)
REFRESH_INTERVAL_SECONDS = 6 * 60 * 60
RETRY_INTERVAL_SECONDS = 5 * 60
REQUEST_TIMEOUT_SECONDS = 5
MAX_RESPONSE_BYTES = 2 * 1024 * 1024

CatalogRow = dict[str, str]
CatalogData = dict[str, CatalogRow]
CatalogFetcher = Callable[[], CatalogData]


class _CatalogTableParser(HTMLParser):
    """Extract the three-column skill tables from the rendered docs page."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._row: list[str] | None = None
        self._cell: list[str] | None = None
        self.rows: list[list[str]] = []

    def handle_starttag(self, tag: str, _attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self._row = []
        elif tag in {"td", "th"} and self._row is not None:
            self._cell = []

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._cell is not None:
            assert self._row is not None
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if len(self._row) == 3:
                self.rows.append(self._row)
            self._row = None


def parse_official_catalog(content: str) -> CatalogData:
    """Parse the official rendered catalog into name-indexed Chinese rows."""

    parser = _CatalogTableParser()
    parser.feed(content)
    rows: CatalogData = {}
    for name, description, install_path in parser.rows:
        if name in {"技能", "Skill"} or not name or not description or not install_path:
            continue
        rows[name] = {
            "descriptionZh": description,
            "path": install_path,
        }
    if not rows:
        raise ValueError("Hermes 官方中文技能目录中没有可用条目")
    return rows


def fetch_official_catalog() -> CatalogData:
    """Download and parse the official Simplified Chinese skills catalog."""

    headers = {"User-Agent": "hermes-skill-manager/1"}
    try:
        # Hermes' web runtime already includes httpx. It negotiates correctly
        # with the docs CDN on systems where urllib's TLS handshake is refused.
        import httpx
    except ImportError:
        request = Request(OFFICIAL_CATALOG_URL, headers=headers)
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            payload = response.read(MAX_RESPONSE_BYTES + 1)
            charset = response.headers.get_content_charset() or "utf-8"
    else:
        response = httpx.get(
            OFFICIAL_CATALOG_URL,
            headers=headers,
            timeout=REQUEST_TIMEOUT_SECONDS,
            follow_redirects=True,
        )
        response.raise_for_status()
        payload = response.content
        charset = response.encoding or "utf-8"
    if len(payload) > MAX_RESPONSE_BYTES:
        raise ValueError("Hermes 官方中文技能目录响应过大")
    return parse_official_catalog(payload.decode(charset))


class BuiltinCatalog:
    """Serve an offline snapshot and refresh it without blocking inventory."""

    def __init__(
        self,
        snapshot_path: Path,
        fetcher: CatalogFetcher = fetch_official_catalog,
        *,
        background_refresh: bool = True,
    ) -> None:
        self.snapshot_path = Path(snapshot_path)
        self._fetcher = fetcher
        self._background_refresh = background_refresh
        self._lock = threading.RLock()
        self._local_mtime = -1
        self._local: CatalogData = {}
        self._remote: CatalogData | None = None
        self._refreshing = False
        self._next_refresh = 0.0

    @staticmethod
    def _normalize(value: object) -> CatalogData:
        if not isinstance(value, dict):
            return {}
        result: CatalogData = {}
        for name, raw in value.items():
            if not isinstance(name, str) or not isinstance(raw, dict):
                continue
            description = raw.get("descriptionZh")
            install_path = raw.get("path")
            if not isinstance(description, str) or not description:
                continue
            result[name] = {
                "descriptionZh": description,
                "path": install_path if isinstance(install_path, str) else "",
            }
        return result

    def _load_local(self) -> CatalogData:
        try:
            modified = self.snapshot_path.stat().st_mtime_ns
        except OSError:
            return {}
        with self._lock:
            if modified == self._local_mtime:
                return self._local
        try:
            document = json.loads(self.snapshot_path.read_text(encoding="utf-8"))
            raw_skills = document.get("skills", {}) if isinstance(document, dict) else {}
            loaded = self._normalize(raw_skills)
        except Exception:
            loaded = {}
        with self._lock:
            self._local = loaded
            self._local_mtime = modified
            return self._local

    def refresh_now(self) -> bool:
        """Refresh from the official page; keep the last good data on failure."""

        try:
            refreshed = self._normalize(self._fetcher())
            if not refreshed:
                raise ValueError("Hermes 官方中文技能目录为空")
        except Exception:
            with self._lock:
                self._next_refresh = time.monotonic() + RETRY_INTERVAL_SECONDS
            return False
        with self._lock:
            self._remote = refreshed
            self._next_refresh = time.monotonic() + REFRESH_INTERVAL_SECONDS
        return True

    def _refresh_worker(self) -> None:
        try:
            self.refresh_now()
        finally:
            with self._lock:
                self._refreshing = False

    def _schedule_refresh(self) -> None:
        if not self._background_refresh:
            return
        with self._lock:
            if self._refreshing or time.monotonic() < self._next_refresh:
                return
            self._refreshing = True
        threading.Thread(
            target=self._refresh_worker,
            name="skill-manager-catalog-refresh",
            daemon=True,
        ).start()

    def snapshot(self) -> CatalogData:
        """Return current official data immediately and refresh in background."""

        local = self._load_local()
        self._schedule_refresh()
        with self._lock:
            # A successful live response is authoritative: descriptions absent
            # from the official Chinese page must fall back to the skill's own
            # English frontmatter rather than a locally invented translation.
            return dict(self._remote if self._remote is not None else local)


_SHARED_LOCK = threading.Lock()
_SHARED_CATALOGS: dict[Path, BuiltinCatalog] = {}


def shared_builtin_catalog(snapshot_path: Path) -> BuiltinCatalog:
    """Reuse one refresh/cache worker across request-scoped managers."""

    key = Path(snapshot_path).resolve()
    with _SHARED_LOCK:
        catalog = _SHARED_CATALOGS.get(key)
        if catalog is None:
            catalog = BuiltinCatalog(key)
            _SHARED_CATALOGS[key] = catalog
        return catalog
