import { DEFAULT_VIEW_SETTINGS } from '@mdx/core';
import { createTranslator, englishCatalog } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import { applyViewCommand, isViewCommand } from '../view/viewCommands';
import {
  SETTING_DEFINITIONS,
  matchesQuery,
  matchingSettings,
  type SettingDefinition,
} from './settingDefinitions';

const translator = createTranslator();

function settingWithId(id: string): SettingDefinition {
  const setting = SETTING_DEFINITIONS.find((candidate) => candidate.id === id);
  if (!setting) throw new Error(`No setting ${id}`);
  return setting;
}

describe('setting definitions', () => {
  it('gives every setting a name and a description in the catalog', () => {
    const keys = SETTING_DEFINITIONS.flatMap((setting) => [setting.labelKey, setting.descriptionKey]);

    expect(keys.filter((key) => !Object.hasOwn(englishCatalog, key))).toEqual([]);
  });

  it('turns every choice into a view command that applies it', () => {
    for (const setting of SETTING_DEFINITIONS) {
      if (setting.kind !== 'choice') continue;
      for (const choice of setting.choices(translator)) {
        const command = setting.commandFor(choice.value);
        if (!command || !isViewCommand(command)) throw new Error(`${setting.id} ${choice.value}`);

        expect(setting.valueIn(applyViewCommand(DEFAULT_VIEW_SETTINGS, command))).toBe(choice.value);
      }
    }
  });

  it('ignores a choice that does not exist', () => {
    const theme = settingWithId('theme');

    expect(theme.kind === 'choice' && theme.commandFor('neon')).toBeUndefined();
  });

  it('shows whether a panel is on and toggles it', () => {
    const outline = settingWithId('outline');
    if (outline.kind !== 'toggle' || !isViewCommand(outline.toggleCommand)) throw new Error('outline');

    const toggled = applyViewCommand(DEFAULT_VIEW_SETTINGS, outline.toggleCommand);

    expect(outline.isOnIn(DEFAULT_VIEW_SETTINGS)).toBe(false);
    expect(outline.isOnIn(toggled)).toBe(true);
  });

  it('dock corner labels read Bottom right and Bottom left in left-to-right and swap in right-to-left', () => {
    const dock = settingWithId('wheelDock');
    if (dock.kind !== 'choice') throw new Error('wheelDock');

    const labelsIn = (locale: string) =>
      dock.choices(createTranslator({ locale })).map(({ value, label }) => [value, label]);

    expect(labelsIn('en')).toEqual([
      ['bottomInlineEnd', 'Bottom right'],
      ['bottomInlineStart', 'Bottom left'],
    ]);
    expect(labelsIn('ar')).toEqual([
      ['bottomInlineEnd', 'Bottom left'],
      ['bottomInlineStart', 'Bottom right'],
    ]);
  });

  it('each workspace kind setting sends its command', () => {
    const atPointer = settingWithId('wheelAtPointer');
    const wheelButton = settingWithId('wheelButton');
    const chooseKinds = settingWithId('chooseKinds');

    expect(atPointer.kind === 'toggle' && atPointer.toggleCommand).toEqual({
      kind: 'toggleWheelOpenedAtPointer',
    });
    expect(wheelButton.kind === 'toggle' && wheelButton.toggleCommand).toEqual({
      kind: 'toggleWheelButtonInStatusBar',
    });
    expect(chooseKinds.kind === 'action' && chooseKinds.command).toEqual({
      kind: 'showWorkspaceKindSettings',
    });
  });

  it('lists the control wheel keys in the Keyboard section', () => {
    const shortcut = settingWithId('controlWheelShortcut');

    expect(shortcut).toMatchObject({
      kind: 'shortcut',
      section: 'keyboard',
      commandId: 'toggleControlWheel',
    });
  });
});

describe('matchingSettings', () => {
  const idsFor = (query: string) => matchingSettings(query, translator).map((setting) => setting.id);

  it('lists every setting for an empty query', () => {
    expect(idsFor('  ')).toHaveLength(SETTING_DEFINITIONS.length);
  });

  it('finds settings by name, description, section or choice, ignoring case', () => {
    expect(idsFor('THEME')).toEqual(['theme']);
    expect(idsFor('serif')).toEqual(['typography']);
    expect(idsFor('layout')).toEqual([
      'explorer',
      'outline',
      'breadcrumbs',
      'statusBar',
      'previewBesideEditor',
    ]);
    expect(idsFor('dark')).toEqual(['theme']);
  });

  it('needs every word of the query to match', () => {
    expect(idsFor('reading width')).toEqual(['readingWidth']);
    expect(idsFor('reading banana')).toEqual([]);
  });

  it('matches any text against every word of a query', () => {
    expect(matchesQuery('clear data', 'Privacy: Clear All Data')).toBe(true);
    expect(matchesQuery('clear cache', 'Privacy: Clear All Data')).toBe(false);
  });

  it('finds the workspace kind settings and the wheel keys by searching for control wheel', () => {
    expect(idsFor('control wheel')).toEqual([
      'kindSwitcher',
      'wheelDock',
      'wheelAtPointer',
      'wheelButton',
      'controlWheelShortcut',
    ]);
  });

  it('ignores accents when searching', () => {
    expect(idsFor('thème')).toEqual(['theme']);
  });
});
