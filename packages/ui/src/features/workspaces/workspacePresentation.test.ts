import { WORKSPACE_COLOURS, WORKSPACE_ICONS } from '@mdx/core';
import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_COLOUR_VALUES,
  WORKSPACE_ICON_PATHS,
  colourValueOf,
  workspaceIconPathsOf,
} from './workspacePresentation';

const KIND_ICON = ['M0 0h24'] as const;

describe('workspace presentation', () => {
  it('draws every icon and colour of the fixed sets', () => {
    expect(Object.keys(WORKSPACE_ICON_PATHS)).toEqual([...WORKSPACE_ICONS]);
    expect(Object.keys(WORKSPACE_COLOUR_VALUES)).toEqual([...WORKSPACE_COLOURS]);
  });

  it('shows the workspace icon, or the kind icon when it has none', () => {
    expect(workspaceIconPathsOf('star', KIND_ICON)).toBe(WORKSPACE_ICON_PATHS.star);
    expect(workspaceIconPathsOf(null, KIND_ICON)).toBe(KIND_ICON);
  });

  it('treats icons and colours outside the fixed sets as none', () => {
    expect(workspaceIconPathsOf('rocket', KIND_ICON)).toBe(KIND_ICON);
    expect(colourValueOf('#ff00ff')).toBeUndefined();
    expect(colourValueOf('toString')).toBeUndefined();
    expect(colourValueOf('teal')).toBe(WORKSPACE_COLOUR_VALUES.teal);
  });
});
