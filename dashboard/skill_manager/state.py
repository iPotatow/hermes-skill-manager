"""Atomic persistent history for skill operations."""

from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


_STATE_LOCK = threading.RLock()


class StateStore:
    """Read and atomically update the plugin's mutable state."""

    def __init__(self, path: Path, legacy_path: Path | None = None):
        self.path = Path(path)
        self.legacy_path = Path(legacy_path) if legacy_path is not None else None

    @staticmethod
    def now() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _read_json(path: Path, fallback: Any) -> Any:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return fallback

    @staticmethod
    def _normalize(data: Any) -> dict[str, Any]:
        if not isinstance(data, dict):
            data = {"version": 1, "history": []}
        data.setdefault("version", 1)
        if not isinstance(data.get("history"), list):
            data["history"] = []
        return data

    def load(self) -> dict[str, Any]:
        data = self._read_json(self.path, None)
        if data is None and self.legacy_path is not None and self.legacy_path.exists():
            data = self._read_json(self.legacy_path, None)
        return self._normalize(data)

    def save(self, state: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(f".{self.path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
        try:
            temporary.write_text(
                json.dumps(state, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            os.replace(temporary, self.path)
        finally:
            if temporary.exists():
                temporary.unlink()

    def record(self, event: dict[str, Any]) -> None:
        # The lock is module-wide because the HTTP adapter creates a fresh
        # service/store per request. Per-instance locks would lose updates.
        with _STATE_LOCK:
            state = self.load()
            entry = dict(event)
            entry.setdefault("at", self.now())
            state["history"].insert(0, entry)
            state["history"] = state["history"][:200]
            self.save(state)

    def record_best_effort(self, event: dict[str, Any]) -> None:
        try:
            self.record(event)
        except Exception:
            # History must never turn a completed filesystem action into a 500.
            pass
