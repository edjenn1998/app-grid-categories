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

function harness(modernSignals = true) {
    const idle = new Map();
    let nextId = 1;
    const removedMonitors = [];
    let written = model.serializeConfig(model.defaults());
    let draggable;
    class AppIcon {
        constructor() {
            this.signals = new Map();
            this.app = {get_id: () => 'writer.desktop',
                get_app_info: () => ({get_categories: () => 'Office;'})};
        }

        connect(signal, callback) {
            this.signals.set(signal, callback);
            return signal;
        }
    }
    const DND = {
        DragMotionResult: {MOVE_DROP: 1, NO_DROP: 0, CONTINUE: 2},
        makeDraggable() {
            const handlers = new Map();
            draggable = {connect: (signal, callback) => {
                handlers.set(signal, callback);
                return signal;
            }, disconnect: signal => handlers.delete(signal),
            emit: signal => handlers.get(signal)?.()};
            if (modernSignals) {
                draggable.connectObject = (...args) => {
                    for (let index = 0; index < args.length - 1; index += 2)
                        handlers.set(args[index], args[index + 1]);
                };
                draggable.disconnectObject = () => handlers.clear();
            }
            return draggable;
        },
        removeDragMonitor: monitor => removedMonitors.push(monitor),
    };
    const Extension = vm.runInNewContext(`${source}\nAppGridCategories`, {
        ...model, AppIcon, DND, Extension: class {},
        global: {get_current_time: () => 123},
        GLib: {PRIORITY_DEFAULT_IDLE: 0, SOURCE_REMOVE: false,
            idle_add: (_priority, callback) => {
                const id = nextId++;
                idle.set(id, callback);
                return id;
            }, source_remove: id => idle.delete(id)},
    });
    const extension = new Extension();
    Object.assign(extension, {
        _categories: model.defaults(), _selected: 'office', _idle: 0,
        _signals: [], _native: [], _buttons: new Map(), _draggables: new Map(),
        _parental: {shouldShowApp: () => true}, _syncTabStyles() {}, _render() {},
        _settings: {get_string: () => written,
            set_string: (_key, text) => { written = text; }},
    });
    return {extension, AppIcon, DND, getDraggable: () => draggable,
        idle, removedMonitors,
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
        draggable._dragActor = {remove_all_transitions: () => calls.push('transitions removed'),
            destroy: () => calls.push('clone destroyed')};
        draggable._cancelDrag = () => { calls.push('cancelled'); };
        draggable._finishAnimation = () => {
            calls.push('finished');
            draggable._dragActor = null;
        };
        h.extension.disable();
        assert.deepEqual(calls, [...(animating ? [] : ['cancelled']),
            'transitions removed', 'finished', 'clone destroyed']);
        draggable.emit('drag-end');
        assert.equal(h.idle.size, 0);
        assert.equal(h.extension._activeDrag, null);
    });
}

test('cancelling a drag leaves membership unchanged', () => {
    const h = harness(false);
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
