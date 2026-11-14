import { describe, expect, it } from 'vitest';
import {
  attachmentFolderFor,
  DEFAULT_WORKSPACE_KIND_ID,
  isBuiltKind,
  WORKSPACE_KINDS,
  workspaceKindsFor,
} from './workspaceKinds';

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

  it('planned kinds become selectable only with the preview', () => {
    const preview = workspaceKindsFor({ allowsPlannedKindPreview: true });

    expect(workspaceKindsFor({ allowsPlannedKindPreview: false })).toBe(WORKSPACE_KINDS);
    expect(preview.map((kind) => kind.id)).toEqual(WORKSPACE_KINDS.map((kind) => kind.id));
    expect(preview.every((kind) => kind.availability === 'built')).toBe(true);
  });

  it('Markdown viewer uses assets next to the document', () => {
    expect(attachmentFolderFor(WORKSPACE_KINDS, 'markdownViewer')).toBe('assets');
  });

  it('a kind-provided folder is used when given', () => {
    const kinds = [{ id: 'notes', availability: 'built', attachmentFolder: 'Attachments' }] as const;

    expect(attachmentFolderFor(kinds, 'notes')).toBe('Attachments');
  });
});
