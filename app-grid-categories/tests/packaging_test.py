#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Validate the built submission, independently of the build allowlist."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent.parent


class SubmissionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.archive = zipfile.ZipFile(
            ROOT / 'dist/app-grid-categories@local.edwin.shell-extension.zip')

    @classmethod
    def tearDownClass(cls):
        cls.archive.close()

    def test_exact_contents_and_integrity(self):
        expected = {
            'metadata.json', 'extension.js', 'prefs.js', 'categories.js',
            'stylesheet.css', 'LICENSE', 'NOTICE', 'PROVENANCE.md',
            'LICENSES/INITIAL-MIT.txt', 'LICENSES/GJS-GUIDE-MIT.txt',
            'schemas/org.gnome.shell.extensions.app-grid-categories.gschema.xml',
            'schemas/gschemas.compiled',
        }
        self.assertEqual(set(self.archive.namelist()), expected)
        self.assertEqual(len(self.archive.namelist()), len(expected))
        self.assertIsNone(self.archive.testzip())
        for name in expected - {'schemas/gschemas.compiled'}:
            self.assertEqual(self.archive.read(name), (ROOT / name).read_bytes())

    def test_metadata_matches_reported_testing(self):
        metadata = json.loads(self.archive.read('metadata.json'))
        self.assertNotIn('version', metadata)
        self.assertEqual(metadata['shell-version'], ['51'])
        self.assertEqual(metadata['url'], 'https://github.com/edjenn1998/app-grid-categories')
        self.assertEqual(metadata['uuid'], 'app-grid-categories@local.edwin')

    def test_licensing_and_headers(self):
        # Exact unmodified full GPL v3 text, checked against the system copy
        # during release preparation (not merely a link or abbreviated notice).
        self.assertEqual(hashlib.sha256(self.archive.read('LICENSE')).hexdigest(),
                         '3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986')
        for name in ('extension.js', 'prefs.js', 'categories.js', 'stylesheet.css',
                     'schemas/org.gnome.shell.extensions.app-grid-categories.gschema.xml'):
            self.assertIn(b'SPDX-License-Identifier: GPL-3.0-or-later', self.archive.read(name))
        self.assertIn(b'Copyright (c) 2026 App Grid Categories contributors',
                      self.archive.read('LICENSES/INITIAL-MIT.txt'))
        self.assertIn('Copyright © 2024 gjs.guide contributors',
                      self.archive.read('LICENSES/GJS-GUIDE-MIT.txt').decode())

    def test_packaged_schema_loads_and_validates_values(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'dist') as temporary:
            self.archive.extractall(temporary)
            base = ['gsettings', '--schemadir', str(Path(temporary) / 'schemas')]
            schema = 'org.gnome.shell.extensions.app-grid-categories'
            env = dict(os.environ, GSETTINGS_BACKEND='memory')

            def run(*args):
                return subprocess.run(base + list(args), env=env, capture_output=True,
                                      text=True, check=True).stdout.strip()

            self.assertEqual(set(run('list-keys', schema).splitlines()),
                             {'categories', 'tab-opacity', 'sort-order', 'app-first-seen'})
            self.assertEqual(run('get', schema, 'sort-order'), "'alphabetical'")
            self.assertEqual(run('range', schema, 'tab-opacity'), 'range i 0 100')
            for mode in ('alphabetical', 'frequent', 'recent'):
                run('set', schema, 'sort-order', mode)
            invalid = subprocess.run(base + ['set', schema, 'sort-order', 'invalid'],
                                     env=env, capture_output=True)
            self.assertNotEqual(invalid.returncode, 0)


if __name__ == '__main__':
    unittest.main()
