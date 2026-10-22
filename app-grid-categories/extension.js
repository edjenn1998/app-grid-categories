// SPDX-License-Identifier: GPL-3.0-or-later
// Small GNOME Shell integration patterns adapted; see PROVENANCE.md and NOTICE.
// Release preparation and lifecycle changes: 2026-10-22.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {AppIcon} from 'resource:///org/gnome/shell/ui/appDisplay.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as ParentalControlsManager from 'resource:///org/gnome/shell/misc/parentalControlsManager.js';

import {categoryForApp, moveApp, parseConfig, parseFirstSeen, serializeConfig,
    sortApps, updateFirstSeen} from './categories.js';

// St.BoxLayout.vertical was removed in 51; orientation was introduced in 48.
function box(vertical, params = {}) {
    const direction = 'orientation' in St.BoxLayout.prototype
        ? {orientation: vertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL}
        : {vertical};
    return new St.BoxLayout({...direction, ...params});
}

function scrollChild(scroll, child) {
    if (typeof scroll.set_child === 'function')
        scroll.set_child(child);
    else
        scroll.add_actor(child); // GNOME 45
}

export default class AppGridCategories extends Extension {
    enable() {
        this._signals = [];
        this._selected = 'all';
        this._idle = 0;
        this._activeDrag = null;
        this._externalDrag = false;
        this._draggables = new Map();
        this._pendingMove = null;
        this._dropTarget = null;
        this._reloadPending = false;
        this._disabling = false;
        try {
            this._settings = this.getSettings();
            this._display = Main.overview._overview.controls.appDisplay;
            this._host = this._display?._box;
            if (!this._host || !this._display._pageIndicators)
                throw new Error('Unsupported GNOME app-grid layout');
            this._native = this._host.get_children().map(actor => [actor, actor.visible]);
            this._parental = ParentalControlsManager.getDefault();
            this._appSystem = Shell.AppSystem.get_default();
            this._usage = Shell.AppUsage.get_default();
            this._recordInstalledApps();

            this._pane = box(true, {x_expand: true, y_expand: true, visible: false,
                style_class: 'agc-pane'});
            this._host.insert_child_at_index(this._pane, 0);
            this._heading = new St.Label({style_class: 'agc-heading'});
            this._pane.add_child(this._heading);
            this._scroll = new St.ScrollView({x_expand: true, y_expand: true,
                hscrollbar_policy: St.PolicyType.NEVER,
                vscrollbar_policy: St.PolicyType.AUTOMATIC});
            this._pane.add_child(this._scroll);
            this._rows = box(true, {x_expand: true, style_class: 'agc-rows'});
            scrollChild(this._scroll, this._rows);
            this._empty = new St.Label({text: 'No apps in this category. Use category settings to add some.',
                style_class: 'agc-empty', x_align: Clutter.ActorAlign.CENTER});
            this._pane.add_child(this._empty);

            this._bar = box(false, {style_class: 'agc-bar', x_expand: true});
            this._host.add_child(this._bar);
            const tabsScroll = new St.ScrollView({x_expand: true,
                // Keep overflow scrolling without drawing a scrollbar below the tabs.
                hscrollbar_policy: St.PolicyType.EXTERNAL,
                vscrollbar_policy: St.PolicyType.NEVER});
            this._bar.add_child(tabsScroll);
            const tabsContainer = box(false, {x_expand: true});
            scrollChild(tabsScroll, tabsContainer);
            this._tabs = box(false, {style_class: 'agc-tabs',
                x_expand: true, x_align: Clutter.ActorAlign.CENTER});
            tabsContainer.add_child(this._tabs);

            this._connect(this._settings, 'changed::categories', () => {
                if (this._activeDrag || this._externalDrag)
                    this._reloadPending = true;
                else
                    this._reload();
            });
            this._connect(this._settings, 'changed::tab-opacity', () => this._syncTabStyles());
            this._connect(this._settings, 'changed::sort-order', () => this._queueRender());
            this._connect(this._appSystem, 'installed-changed', () => {
                this._recordInstalledApps();
                this._queueRender();
            });
            this._connect(this._parental, 'app-filter-changed', () => this._queueRender());
            this._connect(this._pane, 'notify::width', () => this._queueRender());
            this._connect(Main.overview, 'hidden', () => this._select('all'));
            this._connect(Main.overview, 'item-drag-begin', () => {
                this._externalDrag = true;
            });
            this._connect(Main.overview, 'item-drag-end', () => {
                this._externalDrag = false;
                this._setDropTarget(null);
                this._queueRender();
            });
            this._connect(Main.overview, 'item-drag-cancelled', () => this._setDropTarget(null));
            this._reload();
            this._dragMonitor = {
                dragMotion: event => {
                    let actor = event.targetActor;
                    const buttons = [...this._buttons.entries()];
                    while (actor && !buttons.some(([, button]) => button === actor))
                        actor = actor.get_parent();
                    const target = buttons.find(([, button]) => button === actor)?.[0];
                    this._setDropTarget(target && this._canDrop(event.source, target) ? target : null);
                    return DND.DragMotionResult.CONTINUE;
                },
            };
            DND.addDragMonitor(this._dragMonitor);
        } catch (error) {
            this.disable();
            throw error;
        }
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _recordInstalledApps() {
        let previous;
        const text = this._settings.get_string('app-first-seen');
        try {
            previous = parseFirstSeen(text);
        } catch (error) {
            console.error(`${this.uuid}: ${error.message}`);
            previous = null;
        }
        const ids = this._appSystem.get_installed().map(info => info.get_id());
        this._firstSeen = updateFirstSeen(previous, ids, Date.now());
        const updated = JSON.stringify(this._firstSeen);
        if (updated !== text)
            this._settings.set_string('app-first-seen', updated);
    }

    _canDrop(source, destination) {
        if (destination === 'all' || !(source instanceof AppIcon) || !source.app ||
            !this._categories.some(category => category.id === destination && category.enabled))
            return false;
        const info = source.app.get_app_info();
        return Boolean(info) && this._parental.shouldShowApp(info) &&
            categoryForApp(this._categories, source.app.get_id(), info.get_categories())?.id !== destination;
    }

    _setDropTarget(id) {
        if (id === this._dropTarget)
            return;
        this._dropTarget = id;
        this._syncTabStyles();
    }

    _installDropTarget(button, destination) {
        button._delegate = {
            handleDragOver: source => {
                const allowed = this._canDrop(source, destination);
                this._setDropTarget(allowed ? destination : null);
                return allowed ? DND.DragMotionResult.MOVE_DROP : DND.DragMotionResult.NO_DROP;
            },
            acceptDrop: source => {
                if (!this._canDrop(source, destination))
                    return false;
                // Commit after DND has finished with the source actor. Destroying
                // icons or buttons inside acceptDrop breaks Shell's drag cleanup.
                this._pendingMove = {id: source.app.get_id(), destination};
                this._queueRender();
                return true;
            },
        };
    }

    _makeDraggable(icon) {
        // Use native DND with a native icon, but do not emit overview item-drag
        // signals: those tell the hidden GNOME grid to reorder/create folders.
        const draggable = DND.makeDraggable(icon, {timeoutThreshold: 200,
            dragActorMaxSize: 64, dragActorOpacity: 200});
        const onBegin = () => {
            if (this._disabling)
                return;
            this._activeDrag = icon;
            icon.opacity = 120;
        };
        const onEnd = () => {
            if (this._disabling)
                return;
            icon.opacity = 255;
            this._activeDrag = null;
            this._setDropTarget(null);
            this._queueRender();
        };
        let disconnect;
        if (typeof draggable.connectObject === 'function') {
            draggable.connectObject('drag-begin', onBegin, 'drag-end', onEnd, icon);
            disconnect = () => draggable.disconnectObject(icon);
        } else {
            const begin = draggable.connect('drag-begin', onBegin);
            const end = draggable.connect('drag-end', onEnd);
            disconnect = () => {
                draggable.disconnect(begin);
                draggable.disconnect(end);
            };
        }
        this._draggables.set(icon, {draggable, disconnect});
        icon.connect('destroy', () => this._draggables?.delete(icon));
    }

    _stopOwnedDrags() {
        for (const {draggable, disconnect} of this._draggables?.values() ?? []) {
            disconnect();
            // AppIcon supplies a clone, not the original actor. Shell's DND owns
            // a modal grab, hover source and snap-back transition. Finish those
            // synchronously before destroying our icons, so none survive disable.
            // These private DND methods were checked against GNOME 45 and main;
            // live disable-during-drag testing remains required on GNOME 51.1.
            if (draggable._dragActor) {
                if (!draggable._animationInProgress)
                    draggable._cancelDrag(global.get_current_time());
                const clone = draggable._dragActor;
                clone?.remove_all_transitions();
                draggable._finishAnimation();
                clone?.destroy();
            }
        }
        this._draggables?.clear();
    }

    _reload() {
        try {
            this._categories = parseConfig(this._settings.get_string('categories'));
        } catch (error) {
            console.error(`${this.uuid}: ${error.message}`);
            // Keep the last valid configuration rather than overwriting user data.
            this._categories ??= parseConfig('');
        }
        this._buttons?.clear();
        this._tabs.destroy_all_children();
        this._buttons = new Map();
        const categories = [{id: 'all', name: 'All Apps'},
            ...this._categories.filter(category => category.enabled)];
        for (const category of categories) {
            const button = new St.Button({label: category.name, can_focus: true,
                track_hover: true, style_class: 'agc-tab', accessible_name: category.name});
            button.connect('clicked', () => this._select(category.id));
            button.connect('notify::hover', () => this._syncTabStyles());
            this._installDropTarget(button, category.id);
            this._tabs.add_child(button);
            this._buttons.set(category.id, button);
        }
        this._select(this._buttons.has(this._selected) ? this._selected : 'all');
    }

    _syncTabStyles() {
        const alpha = this._settings.get_int('tab-opacity') / 100;
        for (const [id, button] of this._buttons) {
            const color = id === this._dropTarget ? '38, 162, 105'
                : id === this._selected ? '53, 132, 228'
                : button.hover ? '90, 90, 90' : '64, 64, 64';
            const textColor = id === this._selected && alpha < 0.4 ? '#99c1f1' : '#ffffff';
            // Apply opacity only to the oval, never the label or keyboard focus ring.
            button.set_style(`background-color: rgba(${color}, ${alpha}); ` +
                `border-color: rgba(255, 255, 255, ${alpha * 0.25}); color: ${textColor};` +
                (id === this._dropTarget ? ' box-shadow: inset 0 0 0 2px #57e389;' : ''));
        }
    }

    _select(id) {
        const wasFiltered = this._selected !== 'all';
        if (!wasFiltered && id !== 'all')
            this._native = this._native.map(([actor]) => [actor, actor.visible]);
        this._selected = id;
        const filtered = id !== 'all';
        if (filtered || wasFiltered) {
            for (const [actor, wasVisible] of this._native)
                actor.visible = filtered ? false : wasVisible;
        }
        this._pane.visible = filtered;
        for (const [key, button] of this._buttons) {
            if (key === id)
                button.add_style_pseudo_class('checked');
            else
                button.remove_style_pseudo_class('checked');
        }
        this._syncTabStyles();
        if (filtered) {
            const adjustment = typeof this._scroll.get_vadjustment === 'function'
                ? this._scroll.get_vadjustment()
                : this._scroll.get_vscroll_bar().get_adjustment();
            adjustment.value = 0;
            this._queueRender();
        }
    }

    _queueRender() {
        if (this._disabling || this._idle || this._activeDrag || this._externalDrag)
            return;
        this._idle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._idle = 0;
            if (this._disabling || this._activeDrag || this._externalDrag)
                return GLib.SOURCE_REMOVE;
            if (this._pendingMove) {
                const {id, destination} = this._pendingMove;
                this._pendingMove = null;
                // Read the latest settings in case preferences changed mid-drag.
                try {
                    const categories = parseConfig(this._settings.get_string('categories'));
                    if (categories.some(category => category.id === destination && category.enabled)) {
                        moveApp(categories, id, destination);
                        this._settings.set_string('categories', serializeConfig(categories));
                    }
                } catch (error) {
                    console.error(`${this.uuid}: Could not move app: ${error.message}`);
                }
            }
            if (this._reloadPending) {
                this._reloadPending = false;
                this._reload();
            }
            this._render();
            return GLib.SOURCE_REMOVE;
        });
    }

    _render() {
        const category = this._categories.find(item => item.id === this._selected);
        if (!category)
            return;
        const candidates = this._appSystem.get_installed()
            .filter(info => info.should_show() && this._parental.shouldShowApp(info) &&
                categoryForApp(this._categories, info.get_id(), info.get_categories())?.id === category.id)
            .map(info => this._appSystem.lookup_app(info.get_id()))
            .filter(Boolean)
            .map(app => ({id: app.get_id(), name: app.get_name(), app}));
        const apps = sortApps(candidates, this._settings.get_string('sort-order'),
            this._firstSeen, (a, b) => this._usage.compare(a, b)).map(item => item.app);
        const columns = Math.max(1, Math.min(10, Math.floor((this._pane.width - 48) / 144)));
        const key = JSON.stringify([category, columns, apps.map(app => app.get_id())]);
        if (this._lastRendered === key)
            return;
        this._lastRendered = key;
        this._rows.destroy_all_children();
        this._heading.text = `${category.name} · ${apps.length}`;
        this._empty.visible = apps.length === 0;
        for (let offset = 0; offset < apps.length; offset += columns) {
            const row = box(false, {x_align: Clutter.ActorAlign.CENTER,
                style_class: 'agc-row'});
            for (const app of apps.slice(offset, offset + columns)) {
                // Native AppIcon keeps launch, keyboard activation, and app menus.
                const icon = new AppIcon(app, {isDraggable: false});
                this._makeDraggable(icon);
                icon.set_width(128);
                icon.icon.setIconSize(64);
                row.add_child(icon);
            }
            this._rows.add_child(row);
        }
    }

    disable() {
        this._disabling = true;
        if (this._idle)
            GLib.source_remove(this._idle);
        this._idle = 0;
        for (const [object, id] of this._signals ?? [])
            object.disconnect(id);
        this._signals = [];
        if (this._dragMonitor)
            DND.removeDragMonitor(this._dragMonitor);
        this._dragMonitor = null;
        this._stopOwnedDrags();
        if (this._selected !== 'all') {
            for (const [actor, visible] of this._native ?? [])
                actor.visible = visible;
        }
        this._buttons?.clear();
        this._pane?.destroy();
        this._bar?.destroy();
        this._pane = this._bar = this._tabs = this._rows = this._scroll = null;
        this._heading = this._empty = this._host = this._display = null;
        this._settings = this._appSystem = this._parental = null;
        this._usage = this._firstSeen = this._activeDrag = this._pendingMove = null;
        this._draggables = null;
        this._externalDrag = this._reloadPending = false;
        this._dropTarget = null;
        this._buttons = this._categories = this._native = null;
        this._lastRendered = null;
    }
}
