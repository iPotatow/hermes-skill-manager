import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = ROOT / "dashboard"
if str(DASHBOARD) not in sys.path:
    sys.path.insert(0, str(DASHBOARD))

from skill_manager.skills_sh import SkillsShInventory


class SkillsShInventoryTest(unittest.TestCase):
    def test_reads_global_canonical_skill_and_lock_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skills_dir = root / ".agents" / "skills"
            lock_path = root / ".agents" / ".skill-lock.json"
            skill = skills_dir / "vercel-react-best-practices"
            skill.mkdir(parents=True)
            (skill / "SKILL.md").write_text(
                "---\n"
                "name: Vercel React Best Practices\n"
                "description: React performance guidance\n"
                "---\n",
                encoding="utf-8",
            )
            nested = skill / "examples"
            nested.mkdir()
            (nested / "SKILL.md").write_text(
                "---\nname: nested\ndescription: supporting file\n---\n",
                encoding="utf-8",
            )
            lock_path.write_text(
                json.dumps({
                    "version": 3,
                    "skills": {
                        "Vercel React Best Practices": {
                            "source": "vercel-labs/agent-skills",
                            "sourceType": "github",
                            "sourceUrl": "https://github.com/vercel-labs/agent-skills",
                            "skillPath": "skills/react-best-practices/SKILL.md",
                            "skillFolderHash": "abc123",
                            "installedAt": "2026-09-01T01:02:03.000Z",
                            "updatedAt": "2026-09-02T04:05:06.000Z",
                        }
                    },
                }),
                encoding="utf-8",
            )

            diagnostics = []
            rows = SkillsShInventory(skills_dir, lock_path).inventory(diagnostics)

            self.assertEqual(diagnostics, [])
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["name"], "Vercel React Best Practices")
            self.assertEqual(rows[0]["kind"], "skills-sh")
            self.assertEqual(rows[0]["source"], "skills.sh")
            self.assertEqual(rows[0]["rawSource"], "vercel-labs/agent-skills")
            self.assertEqual(rows[0]["category"], "github")
            self.assertEqual(
                rows[0]["identifier"],
                "vercel-labs/agent-skills/vercel-react-best-practices",
            )
            self.assertEqual(rows[0]["availableActions"], [])
            self.assertEqual(rows[0]["skillFolderHash"], "abc123")
            self.assertEqual(rows[0]["installedAt"], "2026-09-01T01:02:03.000Z")
            self.assertEqual(rows[0]["updatedAt"], "2026-09-02T04:05:06.000Z")

    def test_broken_lock_does_not_hide_readable_skills(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skills_dir = root / "skills"
            lock_path = root / ".skill-lock.json"
            skill = skills_dir / "demo"
            skill.mkdir(parents=True)
            (skill / "SKILL.md").write_text(
                "---\nname: demo\ndescription: Demo skill\n---\n",
                encoding="utf-8",
            )
            lock_path.write_text("not json", encoding="utf-8")

            diagnostics = []
            rows = SkillsShInventory(skills_dir, lock_path).inventory(diagnostics)

            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["name"], "demo")
            self.assertEqual(rows[0]["trustLevel"], "local")
            self.assertEqual(rows[0]["availableActions"], [])
            self.assertEqual(diagnostics[0]["component"], "skills-sh-lock")

    def test_symlinked_canonical_entries_are_not_followed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skills_dir = root / "skills"
            outside = root / "outside"
            outside.mkdir()
            (outside / "SKILL.md").write_text(
                "---\nname: outside\ndescription: Outside\n---\n",
                encoding="utf-8",
            )
            skills_dir.mkdir()
            (skills_dir / "linked").symlink_to(outside, target_is_directory=True)

            rows = SkillsShInventory(skills_dir, root / "missing-lock.json").inventory([])

            self.assertEqual(rows, [])


if __name__ == "__main__":
    unittest.main()
