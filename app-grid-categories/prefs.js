// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {categoryForApp, defaults, moveApp, parseConfig, serializeConfig, setMembership} from './categories.js';

function iconButton(icon, tooltip, callback) {
    const button = new Gtk.Button({icon_name: icon, tooltip_text: tooltip,
        valign: Gtk.Align.CENTER});
    button.connect('clicked', callback);
    return button;
}

export default class CategoryPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        let categories;
        try {
            categories = parseConfig(settings.get_string('categories'));
        } catch (error) {
            const page = new Adw.PreferencesPage({title: 'Configuration error'});
            const group = new Adw.PreferencesGroup({title: error.message,
                description: 'Your saved configuration could not be read. Reset it to restore the built-in categories.'});
            const row = new Adw.ActionRow({title: 'Restore default categories'});
            row.add_suffix(iconButton('edit-undo-symbolic', 'Reset configuration', () => {
                settings.reset('categories');
                window.close();
            }));
            group.add(row);
            page.add(group);
            window.add(page);
            return;
        }
        window.set_default_size(780, 720);
        const page = new Adw.PreferencesPage({title: 'App Grid Categories',
            icon_name: 'view-app-grid-symbolic'});
        const appearance = new Adw.PreferencesGroup({title: 'Appearance',
            description: 'Category buttons are centered beneath the app grid.'});
        const opacityRow = new Adw.ActionRow({title: 'Category oval opacity',
            subtitle: '0%: transparent · 50%: semi-transparent · 100%: solid. Text stays visible.'});
        const opacity = new Gtk.Scale({orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({lower: 0, upper: 100, step_increment: 1,
                page_increment: 10, value: settings.get_int('tab-opacity')}),
            digits: 0, draw_value: true, width_request: 220, valign: Gtk.Align.CENTER,
            tooltip_text: 'Category background and border opacity (%)'});
        opacity.add_mark(0, Gtk.PositionType.BOTTOM, '0%');
        opacity.add_mark(50, Gtk.PositionType.BOTTOM, '50%');
        opacity.add_mark(100, Gtk.PositionType.BOTTOM, '100%');
        opacity.connect('value-changed', () => {
            settings.set_int('tab-opacity', Math.round(opacity.get_value()));
        });
        opacityRow.add_suffix(opacity);
        appearance.add(opacityRow);
        const orderRow = new Adw.ActionRow({title: 'Sort apps in categories',
            subtitle: 'Recently added means first detected by this extension. Existing apps start tied.'});
        const orders = ['alphabetical', 'frequent', 'recent'];
        const order = Gtk.DropDown.new_from_strings([
            'Alphabetically', 'Most frequently used', 'Recently added',
        ]);
        order.valign = Gtk.Align.CENTER;
        order.selected = Math.max(0, orders.indexOf(settings.get_string('sort-order')));
        order.connect('notify::selected', () => settings.set_string('sort-order', orders[order.selected]));
        orderRow.add_suffix(order);
        appearance.add(orderRow);
        page.add(appearance);
        const group = new Adw.PreferencesGroup({title: 'Categories',
            description: 'Each app belongs to at most one category. Explicit assignments take priority; the first matching category wins automatic overlaps. All Apps keeps your existing GNOME layout.'});
        page.add(group);
        window.add(page);
        const save = () => settings.set_string('categories', serializeConfig(categories));
        let rows = [];
        const refresh = () => {
            for (const row of rows)
                group.remove(row);
            rows = [];
            categories.forEach((category, index) => {
                const row = new Adw.ActionRow({title: category.name, use_markup: false,
                    subtitle: category.match.length ? `Automatic: ${category.match.join(', ')}` : 'Custom app selection'});
                const enabled = new Gtk.Switch({active: category.enabled, valign: Gtk.Align.CENTER,
                    tooltip_text: 'Show category button'});
                enabled.connect('notify::active', () => {
                    category.enabled = enabled.active;
                    save();
                });
                row.add_prefix(enabled);
                const up = iconButton('go-up-symbolic', 'Move category left', () => {
                    [categories[index - 1], categories[index]] = [categories[index], categories[index - 1]];
                    save();
                    refresh();
                });
                up.sensitive = index > 0;
                row.add_suffix(up);
                const down = iconButton('go-down-symbolic', 'Move category right', () => {
                    [categories[index + 1], categories[index]] = [categories[index], categories[index + 1]];
                    save();
                    refresh();
                });
                down.sensitive = index < categories.length - 1;
                row.add_suffix(down);
                row.add_suffix(iconButton('document-edit-symbolic', 'Edit category', () => {
                    this._edit(window, category, categories, updated => {
                        const position = categories.findIndex(item => item.id === updated.id);
                        if (position === -1)
                            return;
                        categories[position] = updated;
                        for (const id of updated.include)
                            moveApp(categories, id, updated.id);
                        save();
                        refresh();
                    });
                }));
                row.add_suffix(iconButton('user-trash-symbolic', 'Delete category', () => {
                    categories.splice(index, 1);
                    save();
                    refresh();
                }));
                group.add(row);
                rows.push(row);
            });
        };
        refresh();
        const actions = new Adw.PreferencesGroup();
        const add = new Adw.ActionRow({title: 'Add custom category'});
        add.add_suffix(iconButton('list-add-symbolic', 'Add category', () => {
            const category = {id: GLib.uuid_string_random(), name: 'New Category',
                match: [], include: [], exclude: [], enabled: true};
            this._edit(window, category, categories, updated => {
                categories.push(updated);
                for (const id of updated.include)
                    moveApp(categories, id, updated.id);
                save();
                refresh();
            });
        }));
        actions.add(add);
        const reset = new Adw.ActionRow({title: 'Restore default categories',
            subtitle: 'Replaces all custom categories and membership overrides.'});
        reset.add_suffix(iconButton('edit-undo-symbolic', 'Restore defaults', () => {
            const dialog = new Adw.MessageDialog({transient_for: window, modal: true,
                destroy_with_parent: true,
                heading: 'Restore default categories?',
                body: 'Your custom categories and app assignments will be replaced.'});
            dialog.add_response('cancel', 'Cancel');
            dialog.add_response('reset', 'Restore Defaults');
            dialog.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
            dialog.set_default_response('cancel');
            dialog.set_close_response('cancel');
            dialog.connect('response', (_dialog, response) => {
                window._categoryResetDialog = null;
                if (response === 'reset') {
                    categories = defaults();
                    save();
                    refresh();
                }
            });
            window._categoryResetDialog = dialog;
            dialog.present();
        }));
        actions.add(reset);
        page.add(actions);
        // Keep this list current when a drag-and-drop move is made in Shell.
        let changed = settings.connect('changed::categories', () => {
            try {
                categories = parseConfig(settings.get_string('categories'));
                refresh();
            } catch (error) {
                console.error(error);
            }
        });
        const cleanup = () => {
            if (changed) {
                settings.disconnect(changed);
                changed = 0;
            }
            window._categoryEditor?.destroy();
            window._categoryEditor = null;
            window._categoryResetDialog?.destroy();
            window._categoryResetDialog = null;
        };
        window.connect('unrealize', cleanup);
        window.connect('close-request', () => {
            cleanup();
            return false;
        });
    }

    _edit(parent, original, categories, onSave) {
        if (parent._categoryEditor) {
            parent._categoryEditor.present();
            return;
        }
        const category = JSON.parse(JSON.stringify(original));
        const window = new Adw.Window({title: 'Edit category', transient_for: parent,
            modal: true, destroy_with_parent: true, default_width: 700, default_height: 700});
        const content = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
        const header = new Adw.HeaderBar();
        const save = new Gtk.Button({label: 'Save', css_classes: ['suggested-action']});
        header.pack_end(save);
        content.append(header);
        const fields = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 10,
            margin_start: 18, margin_end: 18, margin_top: 12, margin_bottom: 12});
        const name = new Adw.EntryRow({title: 'Category name', text: category.name});
        const tags = new Adw.EntryRow({title: 'Automatic metadata tags (comma-separated)',
            text: category.match.join(', ')});
        const fieldList = new Gtk.ListBox({selection_mode: Gtk.SelectionMode.NONE,
            css_classes: ['boxed-list']});
        fieldList.append(name);
        fieldList.append(tags);
        fields.append(fieldList);
        fields.append(new Gtk.Label({label: 'Example tags: Office, System, Settings, Utility, Network, Game.\nLeave tags empty for a manually curated category.',
            wrap: true, xalign: 0}));
        const search = new Gtk.SearchEntry({placeholder_text: 'Find an installed app…'});
        fields.append(search);
        fields.append(new Gtk.Label({label: 'Include moves the app here from its previous category.\nAutomatic follows metadata; only the first matching category gets the app.', wrap: true, xalign: 0}));
        content.append(fields);
        const scroll = new Gtk.ScrolledWindow({vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER});
        const list = new Gtk.ListBox({selection_mode: Gtk.SelectionMode.NONE,
            margin_start: 18, margin_end: 18, margin_bottom: 18, css_classes: ['boxed-list']});
        scroll.set_child(list);
        content.append(scroll);
        const entries = [];
        const updateTags = () => {
            category.match = tags.text.split(',').map(tag => tag.trim()).filter(Boolean);
        };
        const updateStatus = () => {
            updateTags();
            const drafts = categories.map(item => JSON.parse(JSON.stringify(
                item.id === category.id ? category : item)));
            if (!drafts.some(item => item.id === category.id))
                drafts.push(JSON.parse(JSON.stringify(category)));
            for (const id of category.include)
                moveApp(drafts, id, category.id);
            for (const {row, info} of entries) {
                const owner = categoryForApp(drafts, info.get_id(), info.get_categories());
                row.subtitle = `${owner ? `Category: ${owner.name}` : 'Uncategorized'} · ${info.get_id()}`;
            }
        };
        const apps = Gio.AppInfo.get_all().filter(info => info.should_show() &&
            typeof info.get_categories === 'function')
            .sort((a, b) => a.get_display_name().localeCompare(b.get_display_name()));
        for (const info of apps) {
            const id = info.get_id();
            const row = new Adw.ActionRow({title: info.get_display_name(), use_markup: false});
            const dropdown = Gtk.DropDown.new_from_strings(['Automatic', 'Include', 'Exclude']);
            dropdown.valign = Gtk.Align.CENTER;
            dropdown.selected = category.exclude.includes(id) ? 2 : category.include.includes(id) ? 1 : 0;
            dropdown.connect('notify::selected', () => {
                setMembership(category, id, ['automatic', 'include', 'exclude'][dropdown.selected]);
                updateStatus();
            });
            row.add_suffix(dropdown);
            list.append(row);
            entries.push({row, info});
        }
        tags.connect('changed', updateStatus);
        name.connect('changed', () => {
            save.sensitive = name.text.trim().length > 0;
        });
        search.connect('search-changed', () => {
            const query = search.text.toLocaleLowerCase();
            for (const {row, info} of entries)
                row.visible = `${info.get_display_name()} ${info.get_id()}`.toLocaleLowerCase().includes(query);
        });
        save.connect('clicked', () => {
            category.name = name.text.trim();
            updateTags();
            onSave(category);
            window.close();
        });
        updateStatus();
        window.set_content(content);
        // Keep a reference for the lifetime of the editor.
        parent._categoryEditor = window;
        window.connect('close-request', () => {
            parent._categoryEditor = null;
            return false;
        });
        window.present();
    }
}
