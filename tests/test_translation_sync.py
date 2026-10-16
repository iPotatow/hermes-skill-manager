"""Regression cases for evolving upstream catalogs."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('sync_regression', ROOT / 'scripts/sync_builtin_catalog.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class TranslationSyncTest(unittest.TestCase):
    def test_missing_translation_reports_gap_and_strict_preserves_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ('known', 'future'):
                skill = root / 'skills' / 'web' / name
                skill.mkdir(parents=True)
                (skill / 'SKILL.md').write_text(f'---\nname: {name}\ndescription: English original\n---\n')
            docs = root / 'website/i18n/zh-Hans/docusaurus-plugin-content-docs/current/reference/skills-catalog.md'
            docs.parent.mkdir(parents=True)
            docs.write_text('| [`known`](/known) | 官方译文 | `web/known` |\n')
            catalog = root / 'snapshot.json'
            catalog.write_text('{"skills": {}}\n')
            before = catalog.read_bytes()
            with self.assertRaisesRegex(ValueError, 'future'):
                sync.sync_catalog(root, catalog, strict=True)
            self.assertEqual(catalog.read_bytes(), before)
            self.assertTrue(sync.sync_catalog(root, catalog))
            document = json.loads(catalog.read_text())
            self.assertEqual(document['missingTranslations'], ['future (web/future)'])
            self.assertEqual(document['skills']['known']['descriptionZh'], '官方译文')
            self.assertNotIn('future', document['skills'])
            self.assertFalse(sync.sync_catalog(root, catalog))
