import asyncio
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "dashboard" / "plugin_api.py"


def load_backend():
    spec = importlib.util.spec_from_file_location("skill_manage_test_backend", BACKEND)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class BackendSkillContractTest(unittest.TestCase):
    def test_state_is_atomic_and_lives_outside_the_plugin_installation(self):
        module = load_backend()
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            module.get_hermes_home = lambda: home
            module._save_state({"version": 1, "history": [{"action": "update"}]})

            path = home / "state" / "plugins" / "desktop-skill-manager.json"
            self.assertTrue(path.exists())
            self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["history"][0]["action"], "update")
            self.assertFalse(list(path.parent.glob("*.tmp")))

    def test_history_failure_does_not_mask_a_completed_operation(self):
        module = load_backend()
        module._history = lambda _event: (_ for _ in ()).throw(OSError("read only"))

        module._record_history({"action": "delete", "name": "example"})

    def test_available_actions_are_explicit_and_source_accurate(self):
        module = load_backend()

        self.assertEqual(module._available_actions({"kind": "builtin", "status": "enabled"}), ["reset", "delete"])
        self.assertEqual(
            module._available_actions({"kind": "hub-installed", "status": "enabled"}),
            ["reset", "update", "delete"],
        )
        self.assertEqual(module._available_actions({"kind": "local", "status": "enabled"}), ["delete"])
        self.assertEqual(module._available_actions({"kind": "builtin", "status": "deleted"}), ["restore"])

    def test_reset_requires_exact_name_confirmation(self):
        module = load_backend()
        action = SimpleNamespace(source="builtin", name="example", confirm="")

        with self.assertRaises(module.HTTPException) as raised:
            asyncio.run(module.reset_skill(action))

        self.assertEqual(raised.exception.status_code, 400)

    def test_capture_returns_fallback_and_records_diagnostic(self):
        module = load_backend()
        diagnostics = []

        def broken_loader():
            raise RuntimeError("manifest unavailable")

        result = module._capture("builtin-manifest", broken_loader, set(), diagnostics)

        self.assertEqual(result, set())
        self.assertEqual(diagnostics[0]["component"], "builtin-manifest")
        self.assertIn("manifest unavailable", diagnostics[0]["message"])

    def test_all_content_mutations_clear_the_skill_cache(self):
        source = BACKEND.read_text(encoding="utf-8")
        reset_block = source.split("async def reset_skill", 1)[1].split('@router.post("/restore")', 1)[0]
        update_block = source.split("async def update_skill", 1)[1]

        self.assertIn("_clear_skill_cache()", reset_block)
        self.assertIn("_clear_skill_cache()", update_block)
        self.assertNotIn("\n    _history(", reset_block)

    def test_action_lookup_reports_discovery_failure_instead_of_false_404(self):
        module = load_backend()

        def broken_bundled(diagnostics=None):
            if diagnostics is not None:
                diagnostics.append({"component": "bundled-skills", "message": "API changed"})
            return []

        module._bundled_skills = broken_bundled
        module._inventory_rows = lambda _names, diagnostics=None: []

        with self.assertRaises(module.HTTPException) as raised:
            module._find_skill("builtin", "example")

        self.assertEqual(raised.exception.status_code, 503)

    def test_skill_paths_follow_the_active_profile_without_private_destination_helper(self):
        source = BACKEND.read_text(encoding="utf-8")

        self.assertIn("from tools.skills_tool import _skills_dir as resolve_skills_dir", source)
        self.assertNotIn("_compute_relative_dest", source)


if __name__ == "__main__":
    unittest.main()
