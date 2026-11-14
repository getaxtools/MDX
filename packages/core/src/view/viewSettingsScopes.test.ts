import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_SETTINGS, type ViewSettings } from './ViewSettings';
import {
  WORKSPACE_LAYOUT_FIELDS,
  WORKSPACE_OVERRIDE_FIELDS,
  effectiveViewSettings,
  parseScopedViewSettings,
  parseWorkspaceOverrides,
  splitViewSettings,
} from './viewSettingsScopes';

const CUSTOMIZED: ViewSettings = {
  ...DEFAULT_VIEW_SETTINGS,
  theme: 'nord',
  zoomPercent: 125,
  isSidebarVisible: false,
  sidebarView: 'outline',
  panelWidths: { explorer: 300 },
  isPreviewBesideEditor: true,
};

describe('view settings scopes', () => {
  it('every earlier view field maps to exactly one place', () => {
    const { appSettings, layout } = splitViewSettings(CUSTOMIZED);

    const appFields = Object.keys(appSettings);
    const layoutFields = Object.keys(layout);

    expect([...appFields, ...layoutFields].sort()).toEqual(Object.keys(DEFAULT_VIEW_SETTINGS).sort());
    expect(appFields.filter((field) => layoutFields.includes(field))).toEqual([]);
    expect(layoutFields.sort()).toEqual([...WORKSPACE_LAYOUT_FIELDS].sort());
  });

  it('overrides only fields that stay app settings', () => {
    const { appSettings } = splitViewSettings(DEFAULT_VIEW_SETTINGS);

    for (const field of WORKSPACE_OVERRIDE_FIELDS) expect(appSettings).toHaveProperty(field);
  });

  it('splitting and joining again gives the same settings', () => {
    expect(effectiveViewSettings(splitViewSettings(CUSTOMIZED))).toEqual(CUSTOMIZED);
  });

  it('effective settings use the override, then the app value', () => {
    const scoped = splitViewSettings(CUSTOMIZED);

    const effective = effectiveViewSettings(scoped, { theme: 'sepia' });

    expect(effective.theme).toBe('sepia');
    expect(effective.zoomPercent).toBe(125);
    expect(effectiveViewSettings(scoped, {}).theme).toBe('nord');
  });

  it('reads app settings and layout from where each was saved', () => {
    const scoped = parseScopedViewSettings(
      { zoomPercent: 150, sidebarView: 'search' },
      { sidebarView: 'outline' },
    );

    expect(scoped.appSettings.zoomPercent).toBe(150);
    expect(scoped.layout.sidebarView).toBe('outline');
    expect(scoped.appSettings).not.toHaveProperty('sidebarView');
  });

  it('keeps only valid allowlisted overrides', () => {
    expect(parseWorkspaceOverrides({ theme: 'dark', zoomPercent: 200, typography: 'comic' })).toEqual({
      theme: 'dark',
    });
    expect(parseWorkspaceOverrides('garbage')).toEqual({});
  });
});
