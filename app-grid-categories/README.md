<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# App Grid Categories

This directory contains the GNOME Shell extension. See the
[project README](../README.md) for features, installation and settings.

## Development

Run from this directory with Node.js, Python 3 and GLib tools installed:

```sh
npm test
npm run check
npm run build
npm run test:package
```

The installable package is `dist/app-grid-categories@local.edwin.shell-extension.zip`.
It includes runtime files, schema XML, license texts and attribution notices.
GNOME compiles the schema during installation.

See [RELEASE.md](RELEASE.md) for test results and desktop checks, and
[PROVENANCE.md](PROVENANCE.md) for source references and licensing.
