// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as model from '../categories.js';

// Exercise the actual extension's drop/idle lifecycle with Shell services
// substituted. This does not emulate Clutter layout or replace desktop testing.
const source = readFileSync(new URL('../extension.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '')
    .replace('export default class', 'class');

function harness({fullUI = false} = {}) {
    const idle = new Map();
    let nextId = 1;
    const removedMonitors = [];
    let written = model.serializeConfig(model.defaults());
    let firstSeen = '';
    let draggable;
    const actors = [];
    class Actor {
        constructor(properties = {}) {
            Object.assign(this, {visible: true, width: 800}, properties);
            this.signals = new Map();
            this.children = [];
            this.ownedConnections = [];
            actors.push(this);
        }

        connect(signal, callback) {
            const id = nextId++;
            this.signals.set(id, {signal, callback});
            return id;
        }

        disconnect(id) { this.signals.delete(id); }
        emit(signal) {
            for (const handler of [...this.signals.values()]) {
                if (handler.signal === signal)
                    handler.callback();
            }
        }

        connectObject(signal, callback, owner) {
            const id = this.connect(signal, callback);
            const ownerId = owner.connect('destroy', () => this.disconnect(id));
            this.ownedConnections.push({id, owner, ownerId});
        }

        disconnectObject(owner) {
            for (const connection of this.ownedConnections.filter(item => item.owner === owner)) {
                this.disconnect(connection.id);
                owner.disconnect(connection.ownerId);
            }
            this.ownedConnections = this.ownedConnections.filter(item => item.owner !== owner);
        }

        get_children() { return [...this.children]; }
        add_child(child) { this.children.push(child); child.parent = this; }
        insert_child_at_index(child, index) { this.children.splice(index, 0, child); child.parent = this; }
        set_child(child) { this.add_child(child); }
        get_vadjustment() { return {value: 0}; }
        set_style(style) { this.style = style; }
        add_style_pseudo_class() {}
        remove_style_pseudo_class() {}
        destroy_all_children() {
            for (const child of [...this.children])
                child.destroy();
        }

        destroy() {
            assert.equal(this.destroyed, undefined, 'Actor destroyed twice');
            this.emit('destroy');
            this.destroy_all_children();
            for (const {owner} of [...this.ownedConnections])
                this.disconnectObject(owner);
            this.signals.clear();
            if (this.parent)
                this.parent.children = this.parent.children.filter(child => child !== this);
            this.destroyed = true;
        }
    }
    class AppIcon extends Actor {
        constructor() {
            super();
            this.app = {get_id: () => 'writer.desktop',
                get_app_info: () => ({get_categories: () => 'Office;'})};
        }
    }
    const DND = {
        DragMotionResult: {MOVE_DROP: 1, NO_DROP: 0, CONTINUE: 2},
        makeDraggable() {
            const handlers = new Map();
            draggable = {
                emit: signal => handlers.get(signal)?.(),
                connectObject: (...args) => {
                    for (let index = 0; index < args.length - 1; index += 2)
                        handlers.set(args[index], args[index + 1]);
                },
                disconnectObject: () => handlers.clear(),
            };
            return draggable;
        },
        addDragMonitor() {},
        removeDragMonitor: monitor => removedMonitors.push(monitor),
    };
    const settings = Object.assign(new Actor(), {
        get_string: key => key === 'categories' ? written : firstSeen,
        get_int: () => 100,
        set_string: (key, text) => {
            if (key === 'categories')
                written = text;
            else
                firstSeen = text;
            settings.emit(`changed::${key}`);
        },
    });
    const parental = Object.assign(new Actor(), {shouldShowApp: () => true});
    const appSystem = Object.assign(new Actor(), {get_installed: () => []});
    const usage = {compare: () => 0};
    const host = new Actor();
    const native = [new Actor(), new Actor({visible: false})];
    native.forEach(actor => host.add_child(actor));
    const overview = Object.assign(new Actor(), {
        _overview: {controls: {appDisplay: {_box: host, _pageIndicators: native[1]}}},
    });
    const St = {BoxLayout: Actor, Label: Actor, Button: Actor, ScrollView: Actor,
        PolicyType: {NEVER: 0, AUTOMATIC: 1, EXTERNAL: 2}};
    const Extension = vm.runInNewContext(`${source}\nAppGridCategories`, {
        ...model, AppIcon, DND, St, Extension: class { getSettings() { return settings; } },
        Clutter: {Orientation: {VERTICAL: 1, HORIZONTAL: 0}, ActorAlign: {CENTER: 0}},
        Main: {overview}, ParentalControlsManager: {getDefault: () => parental},
        Shell: {AppSystem: {get_default: () => appSystem}, AppUsage: {get_default: () => usage}},
        global: {get_current_time: () => 123},
        GLib: {PRIORITY_DEFAULT_IDLE: 0, SOURCE_REMOVE: false,
            idle_add: (_priority, callback) => {
                const id = nextId++;
                idle.set(id, callback);
                return id;
            }, source_remove: id => idle.delete(id)},
    });
    const extension = new Extension();
    if (!fullUI) {
        Object.assign(extension, {
            _categories: model.defaults(), _selected: 'office', _idle: 0,
            _signals: [], _native: [], _buttons: new Map(), _draggables: new Map(),
            _parental: parental, _pane: new Actor(), _syncTabStyles() {}, _render() {},
            _settings: settings,
        });
    }
    return {extension, AppIcon, DND, getDraggable: () => draggable,
        idle, removedMonitors, actors, native, host, St,
        emitters: [settings, parental, appSystem, overview],
        flush: () => {
            while (idle.size) {
                const [id, callback] = idle.entries().next().value;
                idle.delete(id);
                callback();
            }
        },
        configure: categories => { written = model.serializeConfig(categories); },
        saved: () => model.parseConfig(written)};
}

test('repeated enable/disable destroys owned widgets, disconnects signals and restores native visibility', () => {
    const h = harness({fullUI: true});
    for (let cycle = 0; cycle < 3; cycle++) {
        const start = h.actors.length;
        h.extension.enable();
        h.extension._select('office');
        h.flush();
        assert.deepEqual(h.native.map(actor => actor.visible), [false, false]);
        h.extension.disable();
        assert.deepEqual(h.native.map(actor => actor.visible), [true, false]);
        assert.deepEqual(h.host.get_children(), h.native);
        assert.ok(h.actors.slice(start).every(actor => actor.destroyed));
        assert.ok(h.emitters.every(emitter => emitter.signals.size === 0));
        assert.equal(h.idle.size, 0);
        assert.equal(h.extension._settings, null);
        assert.equal(h.extension._appSystem, null);
    }
});

for (const [type, style] of [['Label', 'agc-heading'], ['Label', 'agc-empty'], ['Button', 'agc-tab']]) {
    test(`failure creating ${style} releases partial startup without destroying native actors`, () => {
        const h = harness({fullUI: true});
        const start = h.actors.length;
        const Widget = h.St[type];
        h.St[type] = class extends Widget {
            constructor(properties) {
                if (properties.style_class === style)
                    throw new Error('Widget allocation failed');
                super(properties);
            }
        };
        assert.throws(() => h.extension.enable(), /Widget allocation failed/);
        assert.ok(h.actors.slice(start).every(actor => actor.destroyed));
        assert.deepEqual(h.host.get_children(), h.native);
        assert.ok(h.native.every(actor => !actor.destroyed));
        assert.ok(h.emitters.every(emitter => emitter.signals.size === 0));
        assert.equal(h.extension._pane, null);
        assert.equal(h.extension._settings, null);
        h.extension.disable();
    });
}

test('destroying a rendered icon drops its draggable without leaving an owner signal', () => {
    const h = harness();
    const icon = new h.AppIcon();
    h.extension._makeDraggable(icon);
    assert.equal(h.extension._draggables.size, 1);
    icon.destroy();
    assert.equal(h.extension._draggables.size, 0);
    assert.equal(h.extension._pane.signals.size, 0);
});

test('a category drop commits only after drag cleanup and persists one destination', () => {
    const h = harness();
    const icon = new h.AppIcon();
    const button = {};
    h.extension._makeDraggable(icon);
    h.extension._installDropTarget(button, 'games');
    h.getDraggable().emit('drag-begin');
    assert.equal(button._delegate.handleDragOver(icon), h.DND.DragMotionResult.MOVE_DROP);
    assert.equal(button._delegate.acceptDrop(icon), true);
    h.flush();
    assert.equal(model.categoryForApp(h.saved(), 'writer.desktop', 'Office;').id, 'office');
    h.getDraggable().emit('drag-end');
    h.flush();
    assert.equal(model.categoryForApp(h.saved(), 'writer.desktop', 'Office;').id, 'games');
    assert.equal(icon.opacity, 255);
});

test('native overview drags defer category persistence until the drag has ended', () => {
    const h = harness();
    const button = {};
    h.extension._externalDrag = true;
    h.extension._installDropTarget(button, 'games');
    assert.equal(button._delegate.acceptDrop(new h.AppIcon()), true);
    assert.equal(h.idle.size, 0);
    h.extension._externalDrag = false;
    h.extension._queueRender();
    h.flush();
    assert.equal(model.categoryForApp(h.saved(), 'writer.desktop', 'Office;').id, 'games');
});

test('disable cancels a pending move/idle, disconnects signals, removes monitor and restores grid', () => {
    const h = harness();
    const actor = {visible: false};
    const monitor = {};
    const disconnected = [];
    h.extension._native = [[actor, true]];
    h.extension._dragMonitor = monitor;
    h.extension._signals = [[{disconnect: id => disconnected.push(id)}, 42]];
    const button = {};
    h.extension._installDropTarget(button, 'games');
    button._delegate.acceptDrop(new h.AppIcon());
    assert.equal(h.idle.size, 1);
    h.extension.disable();
    assert.equal(h.idle.size, 0);
    assert.deepEqual(disconnected, [42]);
    assert.deepEqual(h.removedMonitors, [monitor]);
    assert.equal(actor.visible, true);
    assert.equal(h.extension._pendingMove, null);
    assert.equal(h.extension._settings, null);
    h.flush();
    assert.equal(model.categoryForApp(h.saved(), 'writer.desktop', 'Office;').id, 'office');
    h.extension.disable(); // Idempotent cleanup.
});

for (const animating of [false, true]) {
    test(`disable finishes an owned ${animating ? 'snap-back' : 'active drag'} without late callbacks`, () => {
        const h = harness();
        const icon = new h.AppIcon();
        h.extension._makeDraggable(icon);
        h.getDraggable().emit('drag-begin');
        const draggable = h.getDraggable();
        const calls = [];
        draggable._animationInProgress = animating;
        const clone = {remove_all_transitions: () => {
            calls.push('transitions removed');
            // Shell's onStopped destroys the current clone, if still attached.
            draggable._dragActor?.destroy();
            draggable._finishAnimation();
        },
            destroy: () => calls.push('clone destroyed')};
        draggable._dragActor = clone;
        draggable._cancelDrag = () => { calls.push('cancelled'); };
        draggable._finishAnimation = () => {
            if (!draggable._dragActor)
                return;
            calls.push('finished');
            draggable._dragActor = null;
        };
        h.extension.disable();
        assert.deepEqual(calls, [...(animating ? [] : ['cancelled']),
            'finished', 'transitions removed', 'clone destroyed']);
        draggable.emit('drag-end');
        assert.equal(h.idle.size, 0);
        assert.equal(h.extension._activeDrag, null);
    });
}

test('cancelling a drag leaves membership unchanged', () => {
    const h = harness();
    const icon = new h.AppIcon();
    h.extension._makeDraggable(icon);
    h.getDraggable().emit('drag-begin');
    h.getDraggable().emit('drag-end');
    h.flush();
    assert.equal(model.categoryForApp(h.saved(), 'writer.desktop', 'Office;').id, 'office');
});

test('All Apps, existing owner, hidden targets, and non-app drops are rejected', () => {
    const h = harness();
    const icon = new h.AppIcon();
    assert.equal(h.extension._canDrop(icon, 'all'), false);
    assert.equal(h.extension._canDrop(icon, 'office'), false);
    assert.equal(h.extension._canDrop({}, 'games'), false);
    h.extension._categories.find(c => c.id === 'games').enabled = false;
    assert.equal(h.extension._canDrop(icon, 'games'), false);
    icon.app.get_app_info = () => null;
    assert.equal(h.extension._canDrop(icon, 'utilities'), false);
});

test('a target removed in preferences during a drag is not resurrected by dropping', () => {
    const h = harness();
    const icon = new h.AppIcon();
    const button = {};
    h.extension._makeDraggable(icon);
    h.extension._installDropTarget(button, 'games');
    h.getDraggable().emit('drag-begin');
    assert.equal(button._delegate.acceptDrop(icon), true);
    h.configure(model.defaults().filter(category => category.id !== 'games'));
    h.getDraggable().emit('drag-end');
    h.flush();
    assert.equal(h.saved().some(category => category.id === 'games'), false);
    assert.equal(model.categoryForApp(h.saved(), 'writer.desktop', 'Office;').id, 'office');
});
