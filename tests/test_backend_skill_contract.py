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
    def test_sync_to_codex_copies_a_complete_skill_and_records_history(self):
        module = load_backend()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            hermes_skills = root / "hermes-skills"
            codex_skills = root / "codex" / "skills"
            source = hermes_skills / "demo-skill"
            (source / "references").mkdir(parents=True)
            (source / "SKILL.md").write_text("---\nname: demo-skill\n---\n", encoding="utf-8")
            (source / "references" / "guide.md").write_text("guide", encoding="utf-8")
            module._skills_dir = lambda: hermes_skills
            module._codex_skills_dir = lambda: codex_skills
            module._find_skill = lambda _source, _name: {
                "name": "demo-skill", "kind": "local", "source": "local", "installPath": "demo-skill"
            }
            events = []
            module._record_history = events.append

            result = asyncio.run(module.sync_skill_to_codex(SimpleNamespace(
                source="local", name="demo-skill", force=False
            )))

            target = codex_skills / "demo-skill"
            self.assertTrue(result["ok"])
            self.assertEqual((target / "SKILL.md").read_text(encoding="utf-8"), "---\nname: demo-skill\n---\n")
            self.assertEqual((target / "references" / "guide.md").read_text(encoding="utf-8"), "guide")
            self.assertEqual(events[0]["action"], "sync-codex")

    def test_sync_to_codex_requires_force_before_replacing(self):
        module = load_backend()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "hermes" / "demo-skill"
            target = root / "codex" / "skills" / "demo-skill"
            source.mkdir(parents=True)
            target.mkdir(parents=True)
            (source / "SKILL.md").write_text("new", encoding="utf-8")
            (target / "SKILL.md").write_text("old", encoding="utf-8")

            with self.assertRaises(module.HTTPException) as raised:
                module._copy_skill_to_codex(source, target, force=False)
            self.assertEqual(raised.exception.status_code, 409)
            self.assertEqual((target / "SKILL.md").read_text(encoding="utf-8"), "old")

            module._copy_skill_to_codex(source, target, force=True)
            self.assertEqual((target / "SKILL.md").read_text(encoding="utf-8"), "new")
            self.assertFalse(list(target.parent.glob(".*.tmp")))
            self.assertFalse(list(target.parent.glob(".*.bak")))

    def test_sync_to_codex_accepts_community_skills(self):
        module = load_backend()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "hermes" / "community-skill"
            target = root / "codex" / "skills" / "community-skill"
            source.mkdir(parents=True)
            (source / "SKILL.md").write_text("---\nname: community-skill\n---\n", encoding="utf-8")
            module._find_skill = lambda _source, _name: {
                "name": "community-skill", "kind": "hub-installed", "source": "hub", "installPath": "community-skill"
            }
            module._safe_target = lambda _path: source
            module._safe_codex_target = lambda _name, create_root=False: target
            module._record_history = lambda _event: None

            result = asyncio.run(module.sync_skill_to_codex(SimpleNamespace(
                source="hub-installed", name="community-skill", force=False, confirm=""
            )))

            self.assertTrue(result["ok"])
            self.assertTrue((target / "SKILL.md").is_file())

    def test_codex_inventory_lists_user_and_system_skills(self):
        module = load_backend()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "skills"
            user_skill = root / "my-skill"
            system_skill = root / ".system" / "built-in-helper"
            user_skill.mkdir(parents=True)
            system_skill.mkdir(parents=True)
            (user_skill / "SKILL.md").write_text(
                '---\nname: "My Skill"\ndescription: "A user skill"\n---\n', encoding="utf-8"
            )
            (system_skill / "SKILL.md").write_text(
                "---\nname: built-in-helper\ndescription: A system skill\n---\n", encoding="utf-8"
            )
            module._codex_skills_dir = lambda: root

            rows = module._codex_inventory([])

            self.assertEqual({row["name"] for row in rows}, {"My Skill", "built-in-helper"})
            by_name = {row["name"]: row for row in rows}
            self.assertEqual(by_name["My Skill"]["kind"], "user")
            self.assertEqual(by_name["My Skill"]["description"], "A user skill")
            self.assertEqual(by_name["built-in-helper"]["kind"], "system")
            self.assertEqual(by_name["built-in-helper"]["relativePath"], ".system/built-in-helper")

    def test_sync_to_codex_force_requires_exact_name_confirmation(self):
        module = load_backend()
        module._find_skill = lambda _source, _name: {
            "name": "demo-skill", "kind": "local", "source": "local", "installPath": "demo-skill"
        }
        module._safe_target = lambda _path: Path("/tmp/demo-skill")
        module._safe_codex_target = lambda _name, create_root=False: Path("/tmp/codex/demo-skill")
        action = SimpleNamespace(source="local", name="demo-skill", force=True, confirm="wrong")
        with self.assertRaises(module.HTTPException) as raised:
            asyncio.run(module.sync_skill_to_codex(action))
        self.assertEqual(raised.exception.status_code, 400)

    def test_sync_to_codex_rejects_non_local_skills(self):
        module = load_backend()
        module._find_skill = lambda _source, _name: {
            "name": "builtin-skill", "kind": "builtin", "source": "builtin", "installPath": "builtin-skill"
        }
        action = SimpleNamespace(source="builtin", name="builtin-skill", force=False, confirm="")
        with self.assertRaises(module.HTTPException) as raised:
            asyncio.run(module.sync_skill_to_codex(action))
        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("本地技能", raised.exception.detail)

    def test_sync_to_codex_rejects_unsafe_names_and_symlinks(self):
        module = load_backend()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            module._codex_skills_dir = lambda: root / "codex" / "skills"
            for name in ("../escape", "nested/skill", ""):
                with self.assertRaises(module.HTTPException):
                    module._safe_codex_target(name, create_root=True)

            source = root / "source"
            source.mkdir()
            (source / "SKILL.md").write_text("demo", encoding="utf-8")
            (source / "outside-link").symlink_to(root / "outside")
            with self.assertRaises(module.HTTPException) as raised:
                module._validate_sync_source(source)
            self.assertEqual(raised.exception.status_code, 400)

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
