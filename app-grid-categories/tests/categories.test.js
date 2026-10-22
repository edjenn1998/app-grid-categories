// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {categoryForApp, defaults, matches, moveApp, parseConfig, parseFirstSeen,
    serializeConfig, setMembership, sortApps, updateFirstSeen} from '../categories.js';

test('defaults use exact desktop category tokens, including trailing separators', () => {
    const office = defaults().find(category => category.id === 'office');
    assert.equal(matches(office, 'writer.desktop', 'WordProcessor;Office;'), true);
    assert.equal(matches(office, 'other.desktop', 'NotOffice;'), false);
    assert.equal(matches(office, 'other.desktop', null), false);
});

test('manual overrides and restoring automatic membership', () => {
    const category = defaults()[0];
    setMembership(category, 'app.desktop', 'include');
    assert.equal(matches(category, 'app.desktop', ''), true);
    setMembership(category, 'app.desktop', 'exclude');
    assert.equal(matches(category, 'app.desktop', 'System;'), false);
    assert.deepEqual(category.include, []);
    setMembership(category, 'app.desktop', 'automatic');
    assert.equal(matches(category, 'app.desktop', 'System;'), true);
    assert.equal(matches(category, 'app.desktop', ''), false);
});

test('custom manual assignments override metadata and survive serialization', () => {
    const groups = defaults();
    groups.push({id: 'work', name: 'Work', match: [], include: ['writer.desktop'], exclude: [], enabled: true});
    const restored = parseConfig(serializeConfig(groups));
    assert.equal(matches(restored.at(-1), 'writer.desktop', 'Office;'), true);
    assert.equal(matches(restored.find(c => c.id === 'office'), 'writer.desktop', 'Office;'), true);
    assert.equal(categoryForApp(restored, 'writer.desktop', 'Office;').id, 'work');
    assert.equal(matches(restored.at(-1), 'calc.desktop', 'Office;'), false);
    assert.deepEqual(parseConfig(serializeConfig([])), []);
});

test('automatic overlaps have exactly one owner, with deterministic category-order priority', () => {
    const groups = defaults();
    assert.equal(categoryForApp(groups, 'app.desktop', 'Office;Utility;').id, 'office');
    assert.equal(categoryForApp([...groups].reverse(), 'app.desktop', 'Office;Utility;').id, 'utilities');
    assert.equal(categoryForApp(groups, 'app.desktop', ''), null);
    groups.find(category => category.id === 'office').enabled = false;
    assert.equal(categoryForApp(groups, 'app.desktop', 'Office;Utility;').id, 'office');
});

test('moves remove competing explicit assignments and override automatic source matching', () => {
    const groups = defaults();
    const app = 'app.desktop';
    groups[0].include.push(app);
    groups[1].include.push(app); // An old multi-category configuration.
    const destination = groups.find(category => category.id === 'games');
    destination.exclude.push(app);
    moveApp(groups, app, 'games');
    assert.equal(categoryForApp(groups, app, 'Office;Utility;System;').id, 'games');
    assert.deepEqual(groups.filter(category => category.include.includes(app)).map(c => c.id), ['games']);
    assert.equal(destination.exclude.includes(app), false);
    moveApp(groups, app, 'office');
    const restored = parseConfig(serializeConfig(groups));
    assert.equal(categoryForApp(restored, app, 'System;').id, 'office');
    const before = serializeConfig(groups);
    assert.throws(() => moveApp(groups, app, 'missing'));
    assert.equal(serializeConfig(groups), before);
});

test('old conflicting includes resolve to one owner and exclusions still win', () => {
    const groups = defaults();
    groups[0].include.push('app.desktop');
    groups[1].include.push('app.desktop');
    assert.equal(categoryForApp(groups, 'app.desktop', '').id, 'system');
    groups[0].exclude.push('app.desktop');
    assert.equal(categoryForApp(groups, 'app.desktop', '').id, 'office');
});

test('recent app history baselines existing apps, detects new apps, and handles reinstalls', () => {
    assert.equal(parseFirstSeen(''), null);
    let history = updateFirstSeen(null, ['old.desktop'], 1000);
    assert.deepEqual(history, {'old.desktop': 0});
    history = updateFirstSeen(history, ['old.desktop', 'new.desktop'], 2000);
    assert.deepEqual(parseFirstSeen(JSON.stringify(history)), {'old.desktop': 0, 'new.desktop': 2000});
    history = updateFirstSeen(history, ['old.desktop'], 3000);
    history = updateFirstSeen(history, ['old.desktop', 'new.desktop'], 4000);
    assert.equal(history['new.desktop'], 4000);
    assert.throws(() => parseFirstSeen('[]'));
    assert.throws(() => parseFirstSeen('{"bad.desktop":-1}'));
    assert.throws(() => parseFirstSeen('{"bad.desktop":"yesterday"}'));
});

test('all sort modes use alphabetical ties and do not mutate their input', () => {
    const apps = [{id: 'z', name: 'Zebra'}, {id: 'a', name: 'Alpha'}, {id: 'b', name: 'Beta'}];
    const ids = sorted => sorted.map(app => app.id);
    assert.deepEqual(ids(sortApps(apps, 'alphabetical')), ['a', 'b', 'z']);
    assert.deepEqual(ids(sortApps(apps, 'recent', {z: 2, a: 0, b: 2})), ['b', 'z', 'a']);
    const score = {z: 20, a: 0, b: 20};
    assert.deepEqual(ids(sortApps(apps, 'frequent', {}, (a, b) => score[b] - score[a])), ['b', 'z', 'a']);
    assert.deepEqual(ids(sortApps(apps, 'frequent')), ['a', 'b', 'z']);
    assert.deepEqual(ids(apps), ['z', 'a', 'b']);
});

test('configuration rejects malformed, duplicate, reserved IDs and unknown versions', () => {
    assert.throws(() => parseConfig('{'));
    assert.throws(() => parseConfig('{"version":2,"categories":[]}'));
    const categories = defaults();
    assert.throws(() => serializeConfig([categories[0], categories[0]]));
    assert.throws(() => serializeConfig([{...categories[0], id: 'all'}]));
    assert.throws(() => serializeConfig([{...categories[0], include: [2]}]));
    assert.throws(() => serializeConfig([{...categories[0], name: '  '}]));
    assert.deepEqual(parseConfig(''), defaults());
});

test('exclusion wins for conflicting external edits and defaults are independent', () => {
    const category = defaults()[0];
    category.include.push('app.desktop');
    category.exclude.push('app.desktop');
    assert.equal(matches(category, 'app.desktop', 'System;'), false);
    assert.deepEqual(defaults()[0].include, []);
});
