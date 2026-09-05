import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = ROOT / "dashboard"
if str(DASHBOARD) not in sys.path:
    sys.path.insert(0, str(DASHBOARD))

from skill_manager.errors import SkillManagerError
from skill_manager.filesystem import link_skill, safe_link_target
from skill_manager.paths import SkillPaths
from skill_manager.service import SkillManager


class InventoryStub:
    def __init__(self, source_path: Path):
        self.source_path = source_path
        self.row = {
            "name": "demo",
            "kind": "local",
            "source": "local",
            "installPath": "demo",
        }

    def find(self, source, name):
        if source == "local" and name == "demo":
            return dict(self.row)
        raise SkillManagerError(404, f"missing {source}:{name}")

    def safe_target(self, relative_path):
        if relative_path != "demo":
            raise SkillManagerError(400, "unexpected path")
        return self.source_path


class ExternalInventoryStub(InventoryStub):
    def __init__(self, hermes_path: Path, qwen_path: Path):
        super().__init__(hermes_path)
        self.qwen_path = qwen_path

    def find_qwenwork_user(self, relative_path, name):
        if relative_path == "demo" and name == "demo":
            return {
                "name": "demo",
                "kind": "qwen",
                "source": "qwenwork",
                "relativePath": "demo",
            }
        raise SkillManagerError(404, "missing qwen skill")

    def safe_qwenwork_relative_target(self, relative_path):
        if relative_path != "demo":
            raise SkillManagerError(400, "unexpected qwen path")
        return self.qwen_path


class StateStub:
    def __init__(self):
        self.events = []

    def record_best_effort(self, event):
        self.events.append(dict(event))


class AgentSymlinkTest(unittest.TestCase):
    def test_link_skill_keeps_source_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "hermes" / "demo"
            target = root / "codex" / "skills" / "demo"
            source.mkdir(parents=True)
            skill_md = source / "SKILL.md"
            skill_md.write_text("---\nname: demo\n---\n", encoding="utf-8")

            self.assertTrue(link_skill(source, target))
            self.assertTrue(target.is_symlink())
            self.assertEqual(target.resolve(), source.resolve())
            self.assertEqual(skill_md.read_text(encoding="utf-8"), "---\nname: demo\n---\n")
            self.assertFalse(link_skill(source, target))

    def test_link_skill_only_force_replaces_another_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            other = root / "other"
            target = root / "agent" / "skills" / "demo"
            for skill in (source, other):
                skill.mkdir(parents=True)
                (skill / "SKILL.md").write_text("---\nname: demo\n---\n", encoding="utf-8")
            target.parent.mkdir(parents=True)
            target.symlink_to(other, target_is_directory=True)

            with self.assertRaises(SkillManagerError) as raised:
                link_skill(source, target)
            self.assertEqual(raised.exception.status_code, 409)

            self.assertTrue(link_skill(source, target, force=True))
            self.assertEqual(target.resolve(), source.resolve())

            target.unlink()
            target.mkdir()
            (target / "SKILL.md").write_text("local", encoding="utf-8")
            with self.assertRaises(SkillManagerError) as raised:
                link_skill(source, target, force=True)
            self.assertEqual(raised.exception.status_code, 409)
            self.assertFalse(target.is_symlink())

    def test_safe_link_target_allows_existing_symlink_but_rejects_bad_name(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "skills"
            root.mkdir()
            source = Path(directory) / "source"
            source.mkdir()
            (source / "SKILL.md").write_text("demo", encoding="utf-8")
            link = root / "demo"
            link.symlink_to(source, target_is_directory=True)

            self.assertEqual(
                safe_link_target(root, "demo", "bad"),
                root.resolve() / "demo",
            )
            with self.assertRaises(SkillManagerError):
                safe_link_target(root, "../demo", "bad")

    def test_service_links_hermes_skill_to_supported_agents(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "hermes-skills" / "demo"
            source.mkdir(parents=True)
            (source / "SKILL.md").write_text("---\nname: demo\n---\n", encoding="utf-8")
            paths = SkillPaths(
                home_override=root / "hermes-home",
                skills_override=root / "hermes-skills",
                codex_home_override=root / "codex",
                qwenwork_home_override=root / "qwenwork",
                workbuddy_home_override=root / "workbuddy",
            )
            state = StateStub()
            manager = SkillManager(
                paths=paths,
                inventory=InventoryStub(source),
                state=state,
                runtime=object(),
                skills_sh=object(),
            )

            expected = {
                "codex": paths.codex_skills / "demo",
                "qwenwork": paths.qwenwork_skills / "demo",
                "workbuddy": paths.workbuddy_skills / "demo",
            }
            for agent, target in expected.items():
                result = manager.link_agent("local", "demo", agent)
                self.assertEqual(result["originAgent"], "hermes")
                self.assertEqual(result["targetAgent"], agent)
                self.assertTrue(target.is_symlink())
                self.assertEqual(target.resolve(), source.resolve())

            self.assertTrue(source.is_dir())
            self.assertFalse(source.is_symlink())
            self.assertEqual(
                [event["action"] for event in state.events],
                ["link-codex", "link-qwenwork", "link-workbuddy"],
            )

    def test_external_agent_skill_can_link_to_hermes_but_not_to_itself(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            hermes_root = root / "hermes-skills"
            qwen_source = root / "qwen" / "skills" / "demo"
            qwen_source.mkdir(parents=True)
            (qwen_source / "SKILL.md").write_text("---\nname: demo\n---\n", encoding="utf-8")
            paths = SkillPaths(
                skills_override=hermes_root,
                qwenwork_home_override=root / "qwen",
            )
            manager = SkillManager(
                paths=paths,
                inventory=ExternalInventoryStub(hermes_root / "unused", qwen_source),
                state=StateStub(),
                runtime=object(),
                skills_sh=object(),
            )

            result = manager.link_agent("qwen", "demo", "hermes", relative_path="demo")
            target = hermes_root / "demo"
            self.assertEqual(result["originAgent"], "qwenwork")
            self.assertTrue(target.is_symlink())
            self.assertEqual(target.resolve(), qwen_source.resolve())

            with self.assertRaises(SkillManagerError) as raised:
                manager.link_agent("qwen", "demo", "qwenwork", relative_path="demo")
            self.assertEqual(raised.exception.status_code, 400)

    def test_unlink_removes_only_the_binding(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "hermes-skills" / "demo"
            source.mkdir(parents=True)
            skill_md = source / "SKILL.md"
            skill_md.write_text("demo", encoding="utf-8")
            paths = SkillPaths(
                skills_override=root / "hermes-skills",
                codex_home_override=root / "codex",
            )
            state = StateStub()
            manager = SkillManager(
                paths=paths,
                inventory=InventoryStub(source),
                state=state,
                runtime=object(),
                skills_sh=object(),
            )

            manager.link_agent("local", "demo", "codex")
            target = paths.codex_skills / "demo"
            self.assertTrue(target.is_symlink())

            manager.unlink_agent("local", "demo", "codex")
            self.assertFalse(target.exists())
            self.assertFalse(target.is_symlink())
            self.assertTrue(source.is_dir())
            self.assertEqual(skill_md.read_text(encoding="utf-8"), "demo")
            self.assertEqual(state.events[-1]["action"], "unlink-codex")

    def test_service_requires_confirmation_before_rebinding_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "hermes-skills" / "demo"
            other = root / "other" / "demo"
            for skill in (source, other):
                skill.mkdir(parents=True)
                (skill / "SKILL.md").write_text("demo", encoding="utf-8")
            paths = SkillPaths(
                skills_override=root / "hermes-skills",
                codex_home_override=root / "codex",
            )
            target = paths.codex_skills / "demo"
            target.parent.mkdir(parents=True)
            target.symlink_to(other, target_is_directory=True)
            manager = SkillManager(
                paths=paths,
                inventory=InventoryStub(source),
                state=StateStub(),
                runtime=object(),
                skills_sh=object(),
            )

            with self.assertRaises(SkillManagerError) as raised:
                manager.sync_codex("local", "demo")
            self.assertEqual(raised.exception.status_code, 409)

            with self.assertRaises(SkillManagerError) as raised:
                manager.sync_codex("local", "demo", confirm="wrong", force=True)
            self.assertEqual(raised.exception.status_code, 400)

            result = manager.sync_codex("local", "demo", confirm="demo", force=True)
            self.assertEqual(result["codexPath"], str(target))
            self.assertEqual(target.resolve(), source.resolve())

    def test_service_rejects_unknown_agent_and_self_target(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "hermes-skills" / "demo"
            source.mkdir(parents=True)
            (source / "SKILL.md").write_text("demo", encoding="utf-8")
            manager = SkillManager(
                paths=SkillPaths(skills_override=root / "hermes-skills"),
                inventory=InventoryStub(source),
                state=StateStub(),
                runtime=object(),
                skills_sh=object(),
            )

            with self.assertRaises(SkillManagerError) as raised:
                manager.link_agent("local", "demo", "unknown")
            self.assertEqual(raised.exception.status_code, 400)

            with self.assertRaises(SkillManagerError) as raised:
                manager.link_agent("local", "demo", "hermes")
            self.assertEqual(raised.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
