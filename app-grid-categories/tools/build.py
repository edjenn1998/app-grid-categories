#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build an allowlisted submission candidate; never publish or submit it."""
from pathlib import Path
import json
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
FILES = (
    'metadata.json', 'extension.js', 'prefs.js', 'categories.js', 'stylesheet.css',
    'schemas/org.gnome.shell.extensions.app-grid-categories.gschema.xml',
    'LICENSE', 'NOTICE', 'PROVENANCE.md',
    'LICENSES/INITIAL-MIT.txt', 'LICENSES/GJS-GUIDE-MIT.txt',
)


def main():
    metadata = json.loads((ROOT / 'metadata.json').read_text())
    if 'version' in metadata:
        raise ValueError('extensions.gnome.org manages the version field')
    if not metadata.get('shell-version') or not metadata.get('url'):
        raise ValueError('Tested shell versions and a real project URL are required')
    subprocess.run(['glib-compile-schemas', '--strict', '--dry-run', str(ROOT / 'schemas')], check=True)
    output = ROOT / 'dist'
    output.mkdir(exist_ok=True)
    target = output / f'{metadata["uuid"]}.shell-extension.zip'
    with tempfile.TemporaryDirectory(dir=output) as temporary:
        subprocess.run(['glib-compile-schemas', '--strict',
                        '--targetdir', temporary, str(ROOT / 'schemas')], check=True)
        with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name in FILES:
                archive.write(ROOT / name, name)
            archive.write(Path(temporary) / 'gschemas.compiled', 'schemas/gschemas.compiled')
    print(target)


if __name__ == '__main__':
    main()
