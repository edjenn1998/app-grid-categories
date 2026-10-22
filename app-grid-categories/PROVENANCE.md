<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# Provenance and licensing

This account uses the actual development conversation and source consultations,
not a claim of clean-room development. App Grid Categories is an independent
project; references to GNOME, COSMIC, and System76 do not imply affiliation or
endorsement. No other extension was used as a source or forked.

## Distribution terms

The project is distributed under **GPL-3.0-or-later**; the complete GPL v3 text is
in [LICENSE](LICENSE). Source SPDX identifiers express this distribution choice,
not an authorship or copyright-ownership assertion. The project was initially
labelled MIT by the assistant. Its original notice and terms are preserved in
[LICENSES/INITIAL-MIT.txt](LICENSES/INITIAL-MIT.txt), including the original generic
copyright line. That generated line is historical, not verification of ownership.
The earlier MIT grant is not retroactively revoked. MIT material can be included
under the GPL distribution terms with its notices preserved.

GNOME Shell's GPL-2.0-or-later permits selection of GPL v3. No incompatible terms
were identified for the material actually included. No special permission,
copyright assignment, or upstream endorsement was requested or is asserted.

## COSMIC: feature inspiration and source-informed model

The assistant consulted COSMIC App Library's README, `src/config.rs`,
[`src/app_group.rs`](https://github.com/pop-os/cosmic-app-library/blob/master/src/app_group.rs),
and [`src/app.rs`](https://github.com/pop-os/cosmic-app-library/blob/master/src/app.rs).
The initial URL used `pop-os/cosmic-applibrary`, which redirects to
`pop-os/cosmic-app-library`.

These informed built-in Office/System/Utilities groups, automatic desktop metadata
matching, include/exclude controls, and custom groups. In this project those ideas
appear in `categories.js` (`defaults()`, `matches()`) and the preferences editor.
According to the development history, **no Rust implementation was copied or
translated and no COSMIC assets, translations, UI components, or app-specific
inclusion/exclusion lists were bundled**. The JavaScript model was written after
reading COSMIC's source, so it is source-informed, not clean-room work.

COSMIC's repository publishes [GPL v3 license text](https://github.com/pop-os/cosmic-app-library/blob/master/LICENSE.md).
This account does not infer an additional “or later” grant for COSMIC from that
license text alone. No COSMIC code is included for relicensing. Exclusive ownership,
drag-to-category moves, sorting integration, and discovery timestamps were later
implemented for the user's requirements rather than ported from COSMIC.

Development consultations used moving `master` URLs without recording a commit.
For reproducible reference, the release review observed commit
[`3651caff79bcf36f7c16ba5ed4f41de530c7b1a7`](https://github.com/pop-os/cosmic-app-library/tree/3651caff79bcf36f7c16ba5ed4f41de530c7b1a7)
on 2026-10-22. This is a **release-review snapshot**, not a claimed original pin.

## GNOME Shell: actual small code-pattern adaptations

Upstream is [GPL-2.0-or-later](https://github.com/GNOME/gnome-shell#license);
see its [COPYING](https://github.com/GNOME/gnome-shell/blob/main/COPYING).
Attribution to the GNOME Shell project and its contributors is retained in
[NOTICE](NOTICE). The inspected `appDisplay.js` and `dnd.js` headers have no
individual copyright notice to transplant; this project does not invent one.

| Local portion | Source and scope |
| --- | --- |
| `extension.js`, `_makeDraggable()` | Adapted the small `AppViewItem` pattern from `appDisplay.js`: `DND.makeDraggable(..., {timeoutThreshold: 200})` and drag-begin/drag-end signal registration, including owner-bound `connectObject` in newer Shell. Our opacity callbacks, registry, exclusive moves, and deferred persistence differ from upstream. |
| `_installDropTarget()` | Adapted the native `_delegate.handleDragOver` / `acceptDrop` integration pattern seen in `appDisplay.js` and `dnd.js`. The category validation and move logic are project code; no complete upstream handler was copied. |
| `_stopOwnedDrags()` (release preparation) | Newly written cleanup informed by the native DND lifecycle. Calls the existing private `_cancelDrag`, `_finishAnimation`, and `_dragActor` interfaces to finish a clone's transition/grab before disabling. No upstream cleanup function was copied. This private integration requires desktop regression testing. |

Original development inspected `appDisplay.js` on GNOME 45, 46, 47, 48, 49, 50,
and `main`; drag-related excerpts were read from GNOME 45 and `main`. Exact
development commits were not recorded. A `gnome-51` branch lookup failed during
development; source comparison with `main` was not a test of release 51.

Release-review reference snapshots, observed on 2026-10-22:

- GNOME 45 branch: [`a5fa6111153068ec65ab88f206bfa1b6685c759f`](https://github.com/GNOME/gnome-shell/tree/a5fa6111153068ec65ab88f206bfa1b6685c759f),
  [`appDisplay.js`](https://github.com/GNOME/gnome-shell/blob/a5fa6111153068ec65ab88f206bfa1b6685c759f/js/ui/appDisplay.js),
  [`dnd.js`](https://github.com/GNOME/gnome-shell/blob/a5fa6111153068ec65ab88f206bfa1b6685c759f/js/ui/dnd.js).
- Main: [`7574dd19d71a9e895608aef982b375a3e2727fc4`](https://github.com/GNOME/gnome-shell/tree/7574dd19d71a9e895608aef982b375a3e2727fc4),
  [`appDisplay.js`](https://github.com/GNOME/gnome-shell/blob/7574dd19d71a9e895608aef982b375a3e2727fc4/js/ui/appDisplay.js),
  [`dnd.js`](https://github.com/GNOME/gnome-shell/blob/7574dd19d71a9e895608aef982b375a3e2727fc4/js/ui/dnd.js).

These snapshots do not establish which historical commit supplied each line.
The project distributes the small adaptations under GPL-3.0-or-later using the
upstream GPL v3 option and retains the source attribution above.

## Runtime imports, API conventions, and reference-only reading

- Native `AppIcon`, `DND`, `Main`, and parental-control classes are **runtime
  imports from the installed GNOME Shell**, not copied classes in the ZIP.
- `Shell.AppUsage.compare()` invokes GNOME's usage ranking at runtime. Its C
  implementation was read to check ordering; neither it nor its usage-collection
  algorithm was copied. `shell-app-usage.c` contains a notice for usage-collection
  code written by Owen Taylor, originally LGPL 2.1, Copyright Red Hat, Inc.
  2006–2008. That runtime-only source is not bundled or relicensed here.
- `overviewControls.js`, `iconGrid.js`, and St widget headers were read to check
  container access, icon sizing, orientation, and scrolling APIs. `box()` and
  `scrollChild()` are newly written compatibility wrappers, not copied widgets.
- `gi://` imports use the system's GLib/Gio/GTK/libadwaita/Shell/St/Clutter
  libraries. Those implementations, icons returned by apps, and theme resources
  are not redistributed in the submission ZIP. Their licenses are not replaced
  by the project's license.
- Standard import syntax and `Extension`/`ExtensionPreferences` subclass
  scaffolding follow the [GJS module guide](https://gjs.guide/extensions/overview/imports-and-modules.html).
  [Porting guidance](https://gjs.guide/extensions/upgrading/gnome-shell-51.html)
  informed compatibility handling. The consulted documentation states **MIT
  Licensed; Copyright © 2024 gjs.guide contributors**. This is conventional,
  documentation-informed scaffolding, not a substantial copied example. Its
  published copyright notice and standard MIT terms are retained conservatively
  in [LICENSES/GJS-GUIDE-MIT.txt](LICENSES/GJS-GUIDE-MIT.txt). That file is not
  claimed to be a byte-for-byte download of an upstream LICENSE file.
- Desktop `Categories=` tag names are standard metadata, not copied COSMIC lists.

The settings editor, CSS, category ownership/moves, discovery timestamps, sort
adapter, schema, build tooling, and tests were generated for this project. No
third-party JavaScript packages, images, binaries, or other extensions were vendored.

## AI involvement and limits of this record

The initial implementation and subsequent changes were substantially generated by
an OpenCode AI assistant at the user's direction. This is not merely a claim of
AI autocomplete, nor a certification of independent human authorship. The user
reported that it worked and later identified GNOME Shell 51.1 as a tested version;
the precise feature coverage and human source-review status were not established.

This record identifies the source consultations and small adaptations visible in
the conversation. It is not an independent copyright-ownership determination or
a complete historical line-by-line similarity audit. In particular, no original
commit pins or named rights holder for the generated project material were supplied.
No known included portion is blocked by incompatible upstream terms. Future code
with unclear terms must be identified before inclusion rather than assumed cleared.

GNOME's [current AI submission rule](https://gjs.guide/extensions/review-guidelines/review-guidelines.html#extensions-must-not-be-ai-generated)
must be addressed honestly. See [RELEASE.md](RELEASE.md) for the outstanding human
review and desktop verification; preparing a ZIP does not establish eligibility.
