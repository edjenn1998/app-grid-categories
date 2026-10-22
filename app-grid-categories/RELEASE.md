<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# Release preparation record

Prepared locally on 2026-10-22. Nothing has been committed, published, or submitted
by the release-preparation assistant. The repository URL supplied by the user is
https://github.com/edjenn1998/app-grid-categories. Its contents/availability have not
been used as evidence of publication or of a human code review.

## Compatibility evidence

- User-reported desktop test: **GNOME Shell 51.1**. The user previously said the
  extension worked, but did not specify the exact update or feature coverage.
- Submission metadata therefore lists only **51**. GNOME 45–50 were inspected at
  source/API level during development, not desktop-tested; they are not declared.
- No GNOME Shell or GJS is available in the assistant's environment. The exact
  release-preparation changes have not been tested on a GNOME desktop.

## Official rules reviewed

[GNOME Shell Extensions Review Guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html),
accessed 2026-10-22. The current rules require initialization without side effects,
complete signal/object/source cleanup, readable code, separated Shell/preferences
imports, schema XML in the ZIP, compatible licensing, and accurate metadata. The
deprecated manually assigned `version` key has been removed. The UUID is retained
to preserve the existing installation identity; no new session modes are added.

The rule headed **“Extensions must not be AI-generated”** says AI may be used as a
learning/development aid, but developers should be able to justify and explain the
submitted code. This project's implementation was substantially AI-generated.
That history is disclosed in PROVENANCE.md and NOTICE. **It is not currently
certified ready/eligible for EGO submission.** Before any submission, a responsible
human developer must actually review the implementation, correct issues they find,
and be able to explain it. This document does not assert that the repository owner
has already done so. Disclosure or GPL licensing alone does not override that rule;
ask the GNOME extension reviewers about eligibility if uncertainty remains.

## Focused release changes

- GPL-3.0-or-later distribution, full license, source SPDX identifiers, retained
  MIT notices, explicit GNOME-pattern attribution and AI provenance.
- Only user-reported tested major version 51; real URL; no manual `version`.
- Attach created widgets promptly so initialization failure can destroy them.
- Defer reloads and moves during both owned and native overview drags.
- Track owned draggables; disconnect their callbacks and synchronously finish
  outstanding clone animations/grabs/hover work on disable. Clear pending moves,
  idle sources, monitor references, and per-enable state.
- Parent-owned preferences dialogs/editors; idempotent signal cleanup on close
  and unrealize; prevent multiple category editors.
- Allowlisted submission package, excluding README, release notes, tests, tools,
  package-manager files and repository metadata. License/provenance notices remain.

Normal feature behavior, category spacing/centering, opacity, colors, and the
absence of an app-grid settings icon are preserved.

## Automated verification

Run from the repository:

```sh
npm test
npm run check
npm run build
npm run test:package
python3 -m zipfile -t dist/app-grid-categories@local.edwin.shell-extension.zip
```

The JavaScript tests use Node for the pure model and substituted Shell services
for actual extension lifecycle code. They do not exercise Clutter gestures,
GObject behavior, rendering, or GNOME's real modal grabs. Node syntax checking is
not a GJS runtime test or a full ESLint audit. Packaging checks verify the exact
allowlist, metadata, SPDX identifiers, full GPL text, and compiled-schema loading.

The build uses the system `glib-compile-schemas`. There are no installed npm
dependencies, vendored scripts, runtime subprocesses, telemetry, or network calls.

Results for this preparation: **18 JavaScript tests passed**, JavaScript syntax
and strict schema checks passed, **4 packaging tests passed**, and ZIP integrity
passed. The packaged GPL text exactly matches `/usr/share/common-licenses/GPL-3`
(SHA-256 `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`).

Candidate artifact:

```text
dist/app-grid-categories@local.edwin.shell-extension.zip
SHA-256: ca1f426673c33b3242fb450734d302ec02720f7be18f81ee50b85b062b0a67ce
```

This checksum identifies the locally validated artifact, not an EGO approval.
Rebuilding can change ZIP timestamps and therefore the archive checksum; record
the checksum again if a different build is used for desktop testing.

## Outstanding desktop checks on GNOME 51.1

Record the candidate commit/archive checksum, distro, session type, and test result:

- [ ] Fresh installation and update from the existing local build; settings persist.
- [ ] Enable/disable repeatedly with overview open/closed; no duplicate bars/errors.
- [ ] Category centering, overflow scrolling without a line, opacity 0/50/100%,
  display scaling, multi-monitor layout, keyboard focus, app menus and launching.
- [ ] Drag from a category and All Apps to another category, including an empty
  category; exactly one owner; persistence across logout/login; folders/favorites intact.
- [ ] Escape/invalid drop; disable or lock/unlock during active drag AND snap-back;
  verify no stuck pointer, modal grab, ghost icon, hover timer, or journal error.
- [ ] Change/delete/hide a destination in preferences while dragging; pending drop
  must not recreate it. Check reload deferral for native All Apps drags as well.
- [ ] All three sort modes; actual GNOME usage ordering; baseline and newly detected
  installs/removals/reinstalls; moves do not reset first-seen time.
- [ ] Create/edit/rename/reorder/hide/delete categories, reset/cancel reset; close the
  preferences parent with an editor/dialog open; reopen without errors or leaks.
- [ ] Install/remove apps and change parental restrictions while enabled.
- [ ] GNOME search and All Apps preserve ordinary grid behavior/layout.

Use `journalctl --user -f -o cat` to watch for extension errors. These boxes are
intentionally unchecked; the user's earlier general report does not prove them.

## Licensing limits

No incompatible included license was identified. Historical upstream commit pins
were not recorded, and the original generated generic copyright notice does not
verify ownership. Both limitations are explicit in PROVENANCE.md. No new personal
copyright or special permission claim was added. Full source/build tooling should
be published with the eventual GitHub release; it remains local for now.
