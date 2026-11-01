<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# Testing and review notes

## 1.0.2 — 2026-11-01

- Destroy the heading, empty-state label and scroll view explicitly, then release
  widget and service references individually during disable.
- Bind icon-destruction callbacks to the category pane's lifetime and simplify the
  draggable registry.
- Use one preferences refresh path for editor saves and external category changes.
- Copy category fields directly rather than serializing editor state through JSON.
- Reject null category configurations with a useful configuration error.
- Build the release ZIP from current source, with schema XML and no compiled schema
  output. Generated ZIPs are distributed as release assets rather than tracked source files.

Verified locally: **23 JavaScript tests** and **5 packaging/documentation tests**
pass, along with JavaScript syntax, ESLint undefined/unused-variable checks
(ES2021 parser) and strict schema checks. Shexli reports
**0 findings, 0 errors and 0 warnings** for the rebuilt ZIP.

## Automated checks

Run from `app-grid-categories/`:

```sh
npm test
npm run check
npm run build
npm run test:package
shexli dist/app-grid-categories@local.edwin.shell-extension.zip
```

The JavaScript suite covers the category model and the extension's drag/lifecycle
code with substituted Shell services. It checks ownership, sorting, deferred drops,
active/snap-back teardown, repeated enable/disable and partial startup failure.
Packaging tests compare every archived file with its source and check metadata,
license texts, ZIP integrity and schema compilation/loading.

Native Clutter layout, gestures and modal grabs need the desktop checks below.
GNOME Shell and GJS are unavailable in the local test environment.

## GNOME 51 desktop checks

Record the package checksum, Shell version, distribution, session type and display
layout. Desktop use was previously reported on GNOME 51.1; that report did not
specify coverage of each feature below.

- [ ] Install/update the exact ZIP; settings persist across logout/login.
- [ ] Enable/disable with the overview open and closed; check for duplicate bars or errors.
- [ ] Check tab centering, overflow scrolling, opacity 0/50/100%, scaling and keyboard navigation.
- [ ] Launch apps and open app menus; parental-control filtering still applies.
- [ ] Drag from category pages and All Apps to another category, including an empty
  one. Each app has one owner, and GNOME folders/favorites remain intact.
- [ ] Cancel with Escape or an invalid drop. Disable during an active drag and during
  snap-back; check for stuck grabs, ghost icons and journal errors.
- [ ] Edit, hide or delete the destination while dragging. A pending drop must not
  recreate it, and category buttons must remain stable until drag cleanup finishes.
- [ ] Exercise all sort modes, new installs, removals and reinstalls. Moves should
  not change first-seen timestamps.
- [ ] Create, edit, reorder, hide and delete categories. Close an editor without
  saving to discard its changes; Save updates the category list once.
- [ ] Reset defaults, cancel reset, and close preferences with an editor/dialog open.
- [ ] Check that All Apps and global search retain their normal behavior.

Watch for extension errors with `journalctl --user -f -o cat`.

## Integration and attribution

The extension uses GNOME's private app-grid containers and DND cleanup methods.
Recheck those interfaces when adding support for a new Shell version. Module
ownership is straightforward: the extension owns its pane, bar, signal connections,
idle source and draggable registry; GNOME retains its native grid actors and services.

Source references and license notices are retained in [PROVENANCE.md](PROVENANCE.md)
and [NOTICE](NOTICE). Review the current
[GNOME extension guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)
before submitting an update.
