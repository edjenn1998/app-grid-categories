// SPDX-License-Identifier: GPL-3.0-or-later
// Pure data model: shared by GNOME Shell, preferences, and the test runner.
export function defaults() {
    return [
        ['system', 'System', ['System', 'Settings']],
        ['office', 'Office', ['Office']],
        ['utilities', 'Utilities', ['Utility']],
        ['internet', 'Internet', ['Network']],
        ['graphics', 'Graphics', ['Graphics']],
        ['media', 'Sound & Video', ['AudioVideo', 'Audio', 'Video']],
        ['development', 'Development', ['Development']],
        ['games', 'Games', ['Game']],
    ].map(([id, name, match]) => ({id, name, match, include: [], exclude: [], enabled: true}));
}

export function parseConfig(text) {
    if (!text)
        return defaults();
    const config = JSON.parse(text);
    if (config.version !== 1 || !Array.isArray(config.categories))
        throw new Error('Unsupported category configuration');
    const ids = new Set();
    const stringList = value => Array.isArray(value) && value.every(s => typeof s === 'string');
    return config.categories.map(category => {
        if (typeof category.id !== 'string' || !category.id || category.id === 'all' ||
            ids.has(category.id) || typeof category.name !== 'string' || !category.name.trim() ||
            !stringList(category.match) || !stringList(category.include) ||
            !stringList(category.exclude) || typeof category.enabled !== 'boolean')
            throw new Error('Invalid category configuration');
        ids.add(category.id);
        return {...category, name: category.name.trim(),
            match: [...new Set(category.match)], include: [...new Set(category.include)],
            exclude: [...new Set(category.exclude)]};
    });
}

export function serializeConfig(categories) {
    const text = JSON.stringify({version: 1, categories});
    parseConfig(text);
    return text;
}

export function matches(category, id, desktopCategories) {
    // Explicit exclusion takes precedence, even for externally edited settings.
    if (category.exclude.includes(id))
        return false;
    if (category.include.includes(id))
        return true;
    const tags = new Set((desktopCategories ?? '').split(';').filter(Boolean));
    return category.match.some(tag => tags.has(tag));
}

export function setMembership(category, id, mode) {
    if (!['automatic', 'include', 'exclude'].includes(mode))
        throw new Error('Unknown membership mode');
    category.include = category.include.filter(app => app !== id);
    category.exclude = category.exclude.filter(app => app !== id);
    if (mode === 'include')
        category.include.push(id);
    if (mode === 'exclude')
        category.exclude.push(id);
}

// Resolve overlaps once for the entire library. Explicit assignments win over
// metadata; category order breaks ties in old configurations and metadata.
// Hidden categories retain ownership rather than silently moving their apps.
export function categoryForApp(categories, id, desktopCategories) {
    return categories.find(category => category.include.includes(id) &&
        !category.exclude.includes(id)) ??
        categories.find(category => matches(category, id, desktopCategories)) ?? null;
}

export function moveApp(categories, id, destination) {
    const target = categories.find(category => category.id === destination);
    if (!target)
        throw new Error('Unknown destination category');
    for (const category of categories)
        category.include = category.include.filter(app => app !== id);
    setMembership(target, id, 'include');
}

export function parseFirstSeen(text) {
    if (!text)
        return null;
    const data = JSON.parse(text);
    if (!data || Array.isArray(data) || typeof data !== 'object' ||
        !Object.values(data).every(time => Number.isFinite(time) && time >= 0))
        throw new Error('Invalid app discovery history');
    return data;
}

export function updateFirstSeen(previous, ids, now) {
    // Pre-existing apps share a baseline, since their installation dates are
    // unknown. Remove uninstalled IDs so a later reinstall counts as new.
    return Object.fromEntries(ids.map(id => [id,
        previous && Object.hasOwn(previous, id) ? previous[id] : previous ? now : 0]));
}

export function sortApps(apps, mode, firstSeen = {}, compareUsage = () => 0) {
    return [...apps].sort((a, b) => {
        let result = 0;
        if (mode === 'frequent')
            result = compareUsage(a.id, b.id);
        else if (mode === 'recent')
            result = (firstSeen[b.id] ?? 0) - (firstSeen[a.id] ?? 0);
        return result || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
}
