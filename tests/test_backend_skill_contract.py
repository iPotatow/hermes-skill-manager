import asyncio
import importlib.util
import json
import re
import sys
import tempfile
import threading
import types
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = ROOT / "dashboard"
BACKEND = DASHBOARD / "plugin_api.py"
if str(DASHBOARD) not in sys.path:
    sys.path.insert(0, str(DASHBOARD))

from skill_manager.errors import SkillManagerError
from skill_manager.filesystem import (
    copy_file_atomic,
    copy_skill,
    safe_descendant,
    validate_sync_source,
)
from skill_manager.inventory import SkillInventory, capture
from skill_manager.paths import SkillPaths
from skill_manager.runtime import HermesRuntime
from skill_manager.service import SkillManager
from skill_manager.state import StateStore


def load_backend():
    spec = importlib.util.spec_from_file_location("skill_manager_adapter_test", BACKEND)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class StateStub:
    def __init__(self):
        self.events = []

    def load(self):
        return {"version": 1, "history": []}

    @staticmethod
    def now():
        return "2026-07-21T00:00:00+00:00"

    def record_best_effort(self, event):
        self.events.append(dict(event))


class RuntimeStub:
    def __init__(self):
        self.calls = []
        self.clear_count = 0
        self.restore_result = {"ok": True}

    def clear_skill_cache(self):
        self.clear_count += 1

    def uninstall(self, name):
        self.calls.append(("uninstall", name))

    def reset_builtin(self, name):
        self.calls.append(("reset-builtin", name))

    def reset_hub(self, identifier, category):
        self.calls.append(("reset-hub", identifier, category))

    def restore_builtin(self, name):
        self.calls.append(("restore", name))
        return self.restore_result

    def update_hub(self, name):
        self.calls.append(("update", name))

    def update_plugin(self, name, plugin_root, desktop_entry):
        self.calls.append(("plugin-update", name, plugin_root, desktop_entry))
        return {"ok": True, "unchanged": False, "desktopPath": str(desktop_entry)}


class InventoryStub:
    def __init__(self, rows, source_path=None, target_path=None):
        self.rows_by_key = {
            (row.get("kind") or row.get("source"), row["name"]): row
            for row in rows
        }
        self.source_path = source_path
        self.target_path = target_path
        self.missing = {}

    def find(self, source, name):
        try:
            return self.rows_by_key[(source, name)]
        except KeyError as exc:
            raise SkillManagerError(404, f"missing {source}:{name}") from exc

    def find_missing_builtin(self, name):
        try:
            return self.missing[name]
        except KeyError as exc:
            raise SkillManagerError(404, f"missing builtin:{name}") from exc

    def safe_target(self, _relative_path):
        return self.source_path

    def safe_codex_target(self, _name, create_root=False):
        if create_root:
            self.target_path.parent.mkdir(parents=True, exist_ok=True)
        return self.target_path


class BackendSkillContractTest(unittest.TestCase):
    def test_copy_file_atomic_replaces_desktop_entry_without_temporary_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "checkout" / "plugin.js"
            target = root / "active" / "plugin.js"
            source.parent.mkdir()
            target.parent.mkdir()
            source.write_text("new entry", encoding="utf-8")
            target.write_text("old entry", encoding="utf-8")

            copy_file_atomic(source, target)

            self.assertEqual(target.read_text(encoding="utf-8"), "new entry")
            self.assertFalse(list(target.parent.glob(".*.tmp")))

    def test_runtime_uses_hermes_plugin_updater_then_syncs_desktop_entry(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plugin_root = root / "checkout"
            source = plugin_root / "desktop-plugins" / "skill-manager" / "plugin.js"
            target = root / "active" / "plugin.js"
            source.parent.mkdir(parents=True)
            source.write_text("updated entry", encoding="utf-8")

            plugins_cmd = types.ModuleType("hermes_cli.plugins_cmd")
            plugins_cmd.dashboard_update_user_plugin = lambda name: {
                "ok": True, "name": name, "unchanged": False, "output": "updated"
            }
            hermes_cli = types.ModuleType("hermes_cli")
            hermes_cli.__path__ = []
            with patch.dict(sys.modules, {
                "hermes_cli": hermes_cli,
                "hermes_cli.plugins_cmd": plugins_cmd,
            }):
                result = HermesRuntime.update_plugin(
                    "skill-manager", plugin_root, target
                )

            self.assertEqual(target.read_text(encoding="utf-8"), "updated entry")
            self.assertTrue(result["restartRequired"])
            self.assertEqual(result["desktopPath"], str(target))

    def test_copy_skill_is_complete_atomic_and_requires_force(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "hermes" / "demo-skill"
            target = root / "codex" / "skills" / "demo-skill"
            (source / "references").mkdir(parents=True)
            target.mkdir(parents=True)
            (source / "SKILL.md").write_text("new", encoding="utf-8")
            (source / "references" / "guide.md").write_text("guide", encoding="utf-8")
            (target / "SKILL.md").write_text("old", encoding="utf-8")

            with self.assertRaises(SkillManagerError) as raised:
                copy_skill(source, target)
            self.assertEqual(raised.exception.status_code, 409)
            self.assertEqual((target / "SKILL.md").read_text(encoding="utf-8"), "old")

            copy_skill(source, target, force=True)
            self.assertEqual((target / "SKILL.md").read_text(encoding="utf-8"), "new")
            self.assertEqual((target / "references" / "guide.md").read_text(encoding="utf-8"), "guide")
            self.assertFalse(list(target.parent.glob(".*.tmp")))
            self.assertFalse(list(target.parent.glob(".*.bak")))

    def test_sync_source_rejects_root_and_nested_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            source.mkdir()
            (source / "SKILL.md").write_text("demo", encoding="utf-8")
            (source / "outside-link").symlink_to(root / "outside")
            with self.assertRaises(SkillManagerError):
                validate_sync_source(source)

            linked_source = root / "linked-source"
            real_source = root / "real-source"
            real_source.mkdir()
            (real_source / "SKILL.md").write_text("demo", encoding="utf-8")
            linked_source.symlink_to(real_source, target_is_directory=True)
            with self.assertRaises(SkillManagerError):
                validate_sync_source(linked_source)

    def test_safe_descendant_rejects_escape_and_symlink_components(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "skills"
            outside = Path(directory) / "outside"
            root.mkdir()
            outside.mkdir()
            (root / "linked").symlink_to(outside, target_is_directory=True)

            self.assertEqual(
                safe_descendant(root, "category/demo", "unsafe"),
                root.resolve() / "category" / "demo",
            )
            for value in ("", "..", "../escape", "/absolute", "linked/demo"):
                with self.subTest(value=value), self.assertRaises(SkillManagerError):
                    safe_descendant(root, value, "unsafe")

    def test_codex_inventory_lists_only_user_skills(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = SkillPaths(codex_home_override=Path(directory) / "codex")
            user = paths.codex_skills / "my-skill"
            system = paths.codex_skills / ".system" / "helper"
            user.mkdir(parents=True)
            system.mkdir(parents=True)
            (user / "SKILL.md").write_text(
                '---\nname: "My Skill"\ndescription: "A user skill"\n---\n',
                encoding="utf-8",
            )
            (system / "SKILL.md").write_text(
                "---\nname: helper\ndescription: System helper\n---\n",
                encoding="utf-8",
            )

            rows = SkillInventory(paths).codex_inventory([])
            by_name = {row["name"]: row for row in rows}
            self.assertEqual(set(by_name), {"My Skill"})
            self.assertEqual(by_name["My Skill"]["kind"], "user")

    def test_codex_delete_requires_confirmation_and_cannot_reach_system_skills(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = SkillPaths(codex_home_override=Path(directory) / "codex")
            user = paths.codex_skills / "my-skill"
            system = paths.codex_skills / ".system" / "helper"
            user.mkdir(parents=True)
            system.mkdir(parents=True)
            (user / "SKILL.md").write_text(
                "---\nname: My Skill\ndescription: User\n---\n",
                encoding="utf-8",
            )
            (system / "SKILL.md").write_text(
                "---\nname: helper\ndescription: System\n---\n",
                encoding="utf-8",
            )
            state = StateStub()
            runtime = RuntimeStub()
            manager = SkillManager(paths=paths, state=state, runtime=runtime)

            with self.assertRaises(SkillManagerError) as raised:
                manager.delete_codex("My Skill", "my-skill", "wrong")
            self.assertEqual(raised.exception.status_code, 400)
            self.assertTrue(user.exists())

            with self.assertRaises(SkillManagerError) as raised:
                manager.delete_codex("helper", ".system/helper", "helper")
            self.assertEqual(raised.exception.status_code, 404)
            self.assertTrue(system.exists())

            result = manager.delete_codex("My Skill", "my-skill", "My Skill")
            self.assertTrue(result["ok"])
            self.assertFalse(user.exists())
            self.assertTrue(system.exists())
            self.assertEqual(runtime.clear_count, 0)
            self.assertEqual(state.events[0]["action"], "delete-codex")

    def test_available_actions_are_explicit_and_source_accurate(self):
        actions = SkillInventory.available_actions
        self.assertEqual(actions({"kind": "builtin", "status": "enabled"}), ["reset", "delete"])
        self.assertEqual(actions({"kind": "hub-installed", "status": "enabled"}), ["reset", "update", "delete"])
        self.assertEqual(actions({"kind": "local", "status": "enabled"}), ["delete"])
        self.assertEqual(actions({"kind": "builtin", "status": "deleted"}), ["restore"])

    def test_capture_returns_fallback_and_records_diagnostic(self):
        diagnostics = []

        def broken_loader():
            raise RuntimeError("manifest unavailable")

        result = capture("builtin-manifest", broken_loader, set(), diagnostics)
        self.assertEqual(result, set())
        self.assertEqual(diagnostics[0]["component"], "builtin-manifest")
        self.assertIn("manifest unavailable", diagnostics[0]["message"])

    def test_discovery_failure_is_reported_instead_of_false_404(self):
        inventory = SkillInventory(SkillPaths())
        inventory.bundled_skills = lambda diagnostics: diagnostics.append(
            {"component": "bundled-skills", "message": "API changed"}
        ) or []
        inventory.rows = lambda diagnostics, _names=None: []

        with self.assertRaises(SkillManagerError) as raised:
            inventory.find("builtin", "example")
        self.assertEqual(raised.exception.status_code, 503)

    def test_state_store_is_atomic_and_shared_across_request_instances(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state" / "plugins" / "skill-manager.json"
            stores = [StateStore(path) for _index in range(20)]
            threads = [
                threading.Thread(target=store.record, args=({"action": "update", "name": str(index)},))
                for index, store in enumerate(stores)
            ]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()

            state = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(len(state["history"]), 20)
            self.assertFalse(list(path.parent.glob(".*.tmp")))

    def test_renamed_state_store_reads_legacy_plugin_history(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = SkillPaths(home_override=Path(directory) / "hermes")
            paths.legacy_state.parent.mkdir(parents=True)
            paths.legacy_state.write_text(
                json.dumps({"version": 1, "history": [{"action": "update", "name": "old"}]}),
                encoding="utf-8",
            )

            store = StateStore(paths.state, paths.legacy_state)
            self.assertEqual(store.load()["history"][0]["name"], "old")
            store.record({"action": "delete-codex", "name": "new"})

            self.assertTrue(paths.state.is_file())
            self.assertEqual(store.load()["history"][1]["name"], "old")

    def test_history_failure_does_not_mask_completed_operation(self):
        store = StateStore(Path("/unreachable/state.json"))
        store.record = lambda _event: (_ for _ in ()).throw(OSError("read only"))
        store.record_best_effort({"action": "delete", "name": "example"})

    def test_sync_accepts_local_and_community_and_records_history(self):
        for kind in ("local", "hub-installed"):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                source = root / "hermes" / "demo"
                target = root / "codex" / "skills" / "demo"
                source.mkdir(parents=True)
                (source / "SKILL.md").write_text("demo", encoding="utf-8")
                row = {"name": "demo", "kind": kind, "source": kind, "installPath": "demo"}
                inventory = InventoryStub([row], source, target)
                state = StateStub()
                manager = SkillManager(inventory=inventory, state=state, runtime=RuntimeStub())

                result = manager.sync_codex(kind, "demo")
                self.assertTrue(result["ok"])
                self.assertTrue((target / "SKILL.md").is_file())
                self.assertEqual(state.events[0]["action"], "sync-codex")

    def test_sync_rejects_builtin_and_force_requires_exact_confirmation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            target = root / "target"
            source.mkdir()
            (source / "SKILL.md").write_text("demo", encoding="utf-8")
            builtin = {"name": "demo", "kind": "builtin", "source": "builtin", "installPath": "demo"}
            manager = SkillManager(
                inventory=InventoryStub([builtin], source, target),
                state=StateStub(),
                runtime=RuntimeStub(),
            )
            with self.assertRaises(SkillManagerError) as raised:
                manager.sync_codex("builtin", "demo")
            self.assertEqual(raised.exception.status_code, 400)

            local = {"name": "demo", "kind": "local", "source": "local", "installPath": "demo"}
            manager.inventory_reader = InventoryStub([local], source, target)
            with self.assertRaises(SkillManagerError):
                manager.sync_codex("local", "demo", confirm="wrong", force=True)

    def test_destructive_actions_require_exact_name_before_discovery(self):
        manager = SkillManager(inventory=InventoryStub([]), state=StateStub(), runtime=RuntimeStub())
        for method in (manager.delete, manager.reset):
            with self.subTest(method=method.__name__), self.assertRaises(SkillManagerError) as raised:
                method("builtin", "example", "wrong")
            self.assertEqual(raised.exception.status_code, 400)

    def test_all_hermes_content_mutations_clear_cache_and_record(self):
        with tempfile.TemporaryDirectory() as directory:
            local_path = Path(directory) / "local"
            local_path.mkdir()
            rows = [
                {"name": "local", "kind": "local", "source": "local", "installPath": "local"},
                {"name": "builtin", "kind": "builtin", "source": "builtin", "installPath": "builtin"},
                {"name": "hub", "kind": "hub-installed", "source": "hub", "installPath": "hub", "identifier": "owner/repo", "category": "tools"},
            ]
            inventory = InventoryStub(rows, local_path, Path(directory) / "codex")
            inventory.missing["missing"] = {
                "name": "missing", "kind": "builtin", "source": "builtin", "installPath": "missing"
            }
            state = StateStub()
            runtime = RuntimeStub()
            manager = SkillManager(inventory=inventory, state=state, runtime=runtime)

            manager.delete("local", "local", "local")
            manager.reset("builtin", "builtin", "builtin")
            manager.reset("hub-installed", "hub", "hub")
            manager.restore("missing")
            manager.update("hub")

            self.assertEqual(runtime.clear_count, 5)
            self.assertEqual([event["action"] for event in state.events], [
                "delete", "reset", "reset", "restore", "update"
            ])
            self.assertIn(("reset-hub", "owner/repo", "tools"), runtime.calls)

    def test_plugin_update_requires_confirmation_syncs_entry_and_records_history(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = SkillPaths(home_override=Path(directory) / "hermes")
            state = StateStub()
            runtime = RuntimeStub()
            manager = SkillManager(paths=paths, state=state, runtime=runtime)

            with self.assertRaises(SkillManagerError) as raised:
                manager.update_plugin("wrong")
            self.assertEqual(raised.exception.status_code, 400)
            self.assertEqual(runtime.calls, [])

            result = manager.update_plugin("skill-manager")

            self.assertTrue(result["ok"])
            self.assertEqual(runtime.calls, [(
                "plugin-update",
                "skill-manager",
                ROOT,
                paths.home / "desktop-plugins" / "skill-manager" / "plugin.js",
            )])
            self.assertEqual(state.events[0]["action"], "plugin-update")

    def test_inventory_contract_keeps_counts_history_diagnostics_and_paths(self):
        class InventoryForResponse:
            def bundled_skills(self, diagnostics):
                return []

            def rows(self, diagnostics, _names):
                return [
                    {"name": "a", "kind": "builtin", "source": "builtin", "category": "", "status": "enabled"},
                    {"name": "b", "kind": "local", "source": "local", "category": "tools", "status": "disabled"},
                ]

            def missing_builtin_rows(self, _rows, _bundled):
                return [{"name": "missing"}]

            def codex_inventory(self, diagnostics):
                diagnostics.append({"component": "codex-skill", "message": "partial"})
                return [{"name": "codex"}]

        paths = SkillPaths(
            home_override=Path("/hermes"),
            skills_override=Path("/hermes/skills"),
            codex_home_override=Path("/codex"),
        )
        manager = SkillManager(
            paths=paths,
            inventory=InventoryForResponse(),
            state=StateStub(),
            runtime=RuntimeStub(),
        )
        result = manager.inventory()
        self.assertEqual(result["counts"], {"builtin": 1, "local": 1})
        self.assertEqual(result["enabledCount"], 1)
        self.assertEqual(result["disabledCount"], 1)
        self.assertEqual(result["missingBuiltinCount"], 1)
        self.assertEqual(result["codexSkillCount"], 1)
        self.assertTrue(result["meta"]["partial"])
        self.assertEqual(result["meta"]["skillsDir"], "/hermes/skills")

    def test_http_adapter_translates_domain_errors_and_keeps_routes_thin(self):
        module = load_backend()
        expected_routes = {
            "/inventory", "/delete", "/reset", "/restore", "/update",
            "/plugin-update", "/delete-codex", "/sync-codex",
        }
        if hasattr(module.router, "routes"):
            self.assertEqual({route.path for route in module.router.routes}, expected_routes)
        else:
            adapter_source = BACKEND.read_text(encoding="utf-8")
            for route in expected_routes:
                self.assertIn(f'("{route}")', adapter_source)

        class BrokenManager:
            def inventory(self):
                raise module.SkillManagerError(503, "discovery failed")

        module._manager = BrokenManager
        with self.assertRaises(module.HTTPException) as raised:
            asyncio.run(module.inventory())
        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("discovery failed", raised.exception.detail)
        self.assertLess(len(BACKEND.read_text(encoding="utf-8").splitlines()), 140)

    def test_version_metadata_and_documentation_stay_in_sync(self):
        plugin_yaml = (ROOT / "plugin.yaml").read_text(encoding="utf-8")
        plugin_name = re.search(r"^name:\s*(\S+)", plugin_yaml, re.MULTILINE).group(1)
        version = re.search(r"^version:\s*(\S+)", plugin_yaml, re.MULTILINE).group(1)
        manifest = json.loads((DASHBOARD / "manifest.json").read_text(encoding="utf-8"))
        desktop_source = (ROOT / "desktop-plugins" / plugin_name / "plugin.js").read_text(
            encoding="utf-8"
        )
        self.assertEqual(plugin_name, "skill-manager")
        self.assertEqual(plugin_name, manifest["name"])
        self.assertEqual(version, manifest["version"])
        self.assertIn("const ID = 'skill-manager'", desktop_source)
        self.assertIn("iPotatow/hermes-skill-manager", (ROOT / "README.md").read_text(encoding="utf-8"))
        self.assertIn(f"版本：`{version}`", (ROOT / "README.md").read_text(encoding="utf-8"))
        self.assertIn(f"Version: `{version}`", (ROOT / "README_EN.md").read_text(encoding="utf-8"))

    def test_dashboard_manifest_hides_backend_only_plugin_from_sidebar(self):
        manifest = json.loads((DASHBOARD / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["api"], "plugin_api.py")
        self.assertIs(manifest["tab"]["hidden"], True)
        self.assertNotIn("entry", manifest)

    def test_profile_skill_resolution_uses_supported_hermes_helper(self):
        source = (DASHBOARD / "skill_manager" / "paths.py").read_text(encoding="utf-8")
        self.assertIn("from tools.skills_tool import _skills_dir", source)
        self.assertNotIn("_compute_relative_dest", source)


if __name__ == "__main__":
    unittest.main()
