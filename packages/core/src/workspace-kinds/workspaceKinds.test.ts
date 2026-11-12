import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKSPACE_KIND_ID, isBuiltKind, WORKSPACE_KINDS } from './workspaceKinds';

describe('workspace kinds', () => {
  it('lists the kinds in the fixed order', () => {
    expect(WORKSPACE_KINDS.map((kind) => kind.id)).toEqual(['markdownViewer', 'notes', 'specViewer']);
  });

  it('gives every kind a unique id', () => {
    const ids = WORKSPACE_KINDS.map((kind) => kind.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has only the Markdown viewer built', () => {
    const builtIds = WORKSPACE_KINDS.filter((kind) => kind.availability === 'built').map((kind) => kind.id);

    expect(builtIds).toEqual(['markdownViewer']);
  });

  it('starts with a built kind', () => {
    expect(isBuiltKind(WORKSPACE_KINDS, DEFAULT_WORKSPACE_KIND_ID)).toBe(true);
  });

  it('does not treat planned or unknown kinds as built', () => {
    expect(isBuiltKind(WORKSPACE_KINDS, 'notes')).toBe(false);
    expect(isBuiltKind(WORKSPACE_KINDS, 'calendar')).toBe(false);
  });
});
