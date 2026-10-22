<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# App Grid Categories

Organize GNOME's application grid with centered category buttons and flat grids
of related apps. Inspired by COSMIC App Library; an independent project with no
GNOME or System76 endorsement.

[Source and issue tracker](https://github.com/edjenn1998/app-grid-categories) ·
[Provenance](PROVENANCE.md) · [Release/testing record](RELEASE.md)

## Features

- Built-in System, Office, Utilities, Internet, Graphics, Sound & Video,
  Development, and Games groups, plus custom categories.
- Automatic desktop-metadata matching with manual Include/Exclude controls.
  Each app belongs to at most one category: explicit assignments win; otherwise
  the first matching category in button order wins.
- Drag an individual app onto a category button to move it there exclusively.
  The target highlights green; Escape or an invalid drop cancels the move.
- Sort category pages alphabetically, by GNOME's usage ranking, or recently added.
- Centered tabs with hidden overflow scrollbar, adjustable oval opacity (0–100%),
  and no settings button in the app grid. Text stays visible at any opacity.
- Native app icons, app menus, keyboard activation, running indicators, and
  parental-control filtering. Category pages include folder contents and favorites.
- All Apps keeps GNOME's existing folders, icon order, and pagination. It is a
  master list, not a membership category. Search remains GNOME's global search.

Unmatched apps and apps owned by hidden categories remain accessible in All Apps.
Moving an app changes this extension's membership, not its GNOME folder or favorite.
Category pages are alphabetically sorted by default and scroll vertically.

## Compatibility and status

**GNOME Shell 51 only is declared.** The user reported testing **51.1**, without
specifying the exact update or feature coverage. GNOME 45–50 were inspected at
source/API level but have not been desktop-tested and are not declared supported.
New/future releases require testing before being added to metadata.

This is a locally prepared release candidate, **not an approved or submitted EGO
extension**. Automated tests do not establish desktop compatibility. The release
preparation changes need a fresh GNOME 51.1 test; see [RELEASE.md](RELEASE.md).

The implementation was substantially AI-generated using OpenCode. GNOME's current
submission rules require a developer able to explain submitted code and prohibit
AI-generated extensions. Human review and submission eligibility remain outstanding;
this project does not claim that the owner has already reviewed/understood all code.
See [PROVENANCE.md](PROVENANCE.md) for the full development account.

## Build and install

Build requires Python 3 and `glib-compile-schemas` (GLib tools). No npm dependencies
are needed. From the repository directory:

```sh
python3 tools/build.py
gnome-extensions install --force dist/app-grid-categories@local.edwin.shell-extension.zip
```

Log out and log back in to load the new code, then enable:

```sh
gnome-extensions enable app-grid-categories@local.edwin
```

The UUID is retained from local development so updates retain their installation
identity. Shell 45–50 are intentionally rejected by this candidate's metadata.

Open **Show Applications** to browse categories. Open preferences in Extension
Manager, or run:

```sh
gnome-extensions prefs app-grid-categories@local.edwin
```

In **Appearance**, select **Category oval opacity** and **Sort apps in categories**.
Create custom categories with **Add custom category**. Leave metadata tags empty
for manual selection, or use exact tags such as `Office`, `Utility`, or `Network`.
**Include** moves an app here exclusively; **Exclude** prevents membership here;
**Automatic** removes this category's override and follows the ownership rules.
Editor changes apply on Save; close without saving to cancel. Reordering categories
can change ownership for apps whose metadata matches multiple groups.

**Recently added means first detected by this extension, not the exact installation
date.** Existing apps share an unknown-date baseline and tie alphabetically. Apps
detected later sort first; detected removals clear their timestamp so a detected
reinstall counts as new. Apps installed while disabled are dated on next detection.
Moving between categories does not reset this timestamp. Frequency sorting uses
GNOME's available usage history, with alphabetical ties. Sorting affects category
pages, not the All Apps layout.

Disable or uninstall:

```sh
gnome-extensions disable app-grid-categories@local.edwin
gnome-extensions uninstall app-grid-categories@local.edwin
```

## Development checks and packaging

Node.js is needed for JavaScript tests/checks; Python and GLib tools for packaging:

```sh
npm test
npm run check
npm run build
npm run test:package
python3 -m zipfile -t dist/app-grid-categories@local.edwin.shell-extension.zip
```

The submission ZIP contains only runtime files, schema XML/compiled schema, GPL
license, and provenance/attribution notices. Tests, Python build/validation tools,
package files, and development documentation remain in the repository. There are
no runtime external commands or network access. Desktop checks and current
[official review guidance](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)
are recorded in [RELEASE.md](RELEASE.md). Preparing the ZIP does not publish it.

## License and attribution

Distributed under **GPL-3.0-or-later**; see the complete [LICENSE](LICENSE).
[NOTICE](NOTICE), [PROVENANCE.md](PROVENANCE.md), and [LICENSES/](LICENSES/) retain
source attribution and earlier MIT notices. No COSMIC Rust implementation or
COSMIC assets are bundled. Small GNOME integration patterns were adapted; native
GNOME classes are imported from the installed Shell at runtime.
