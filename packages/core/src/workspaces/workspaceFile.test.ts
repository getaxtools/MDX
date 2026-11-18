import { protectedNoteLocation } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_KINDS, workspaceKindsFor } from '../workspace-kinds/workspaceKinds';
import { locationOfPath } from './windowsPaths';
import {
  MAX_WORKSPACE_FILE_BYTES,
  readWorkspaceFile,
  writeWorkspaceFile,
  type PortableWorkspace,
} from './workspaceFile';

const HANDBOOK: PortableWorkspace = {
  name: 'Handbook',
  kindId: 'markdownViewer',
  icon: 'book',
  colour: 'teal',
  roots: [locationOfPath('D:\\team\\docs'), locationOfPath('E:\\shared')],
  favourites: [
    {
      location: locationOfPath('D:\\team\\docs\\guide.md'),
      kind: 'file',
      label: 'Guide',
      groupId: 'group-1',
    },
    { location: locationOfPath('E:\\shared\\plans'), kind: 'folder' },
  ],
  favouriteGroups: [{ id: 'group-1', name: 'Start here' }],
  settingsOverrides: { theme: 'dark' },
};

const READ_OPTIONS = { fileFolder: 'D:\\team', kindRegistry: WORKSPACE_KINDS };

describe('workspace file', () => {
  it('same-drive paths are relative with forward slashes and other paths are absolute and counted', () => {
    const { text, absolutePathCount } = writeWorkspaceFile(HANDBOOK, 'D:\\team');
    const file = JSON.parse(text) as { roots: string[]; favourites: { path: string }[] };

    expect(file.roots).toEqual(['docs', 'E:/shared']);
    expect(file.favourites.map((favourite) => favourite.path)).toEqual(['docs/guide.md', 'E:/shared/plans']);
    expect(absolutePathCount).toBe(2);
  });

  it('only allowlisted keys are written', () => {
    const file = JSON.parse(writeWorkspaceFile(HANDBOOK, 'D:\\team').text) as Record<string, unknown>;

    expect(Object.keys(file).sort()).toEqual(
      [
        'colour',
        'favouriteGroups',
        'favourites',
        'format',
        'formatVersion',
        'icon',
        'kind',
        'name',
        'roots',
        'settingsOverrides',
      ].sort(),
    );
  });

  it('no tabs, recent files, layout or protected content are written', () => {
    const withPrivateState = {
      ...HANDBOOK,
      tabs: ['secret.md'],
      recentFiles: ['diary.md'],
      layout: { isSidebarVisible: false },
    } as PortableWorkspace;

    const text = writeWorkspaceFile(withPrivateState, 'D:\\team').text;

    expect(text).not.toContain('secret.md');
    expect(text).not.toContain('diary.md');
    expect(text).not.toContain('isSidebarVisible');
  });

  it('holds no protected title or id, even when a protected note or section file was a favourite', () => {
    const noteId = '4f1c0a2e9b7d4c3a8e6f5d4c3b2a1f0e';
    const withProtected: PortableWorkspace = {
      ...HANDBOOK,
      roots: [...HANDBOOK.roots, locationOfPath(String.raw`D:\team\.mdx-notes\protected`)],
      favourites: [
        ...HANDBOOK.favourites,
        { location: protectedNoteLocation(String.raw`d:\team`, noteId, 'Bank details'), kind: 'file' },
        {
          location: locationOfPath(`D:\\team\\.mdx-notes\\protected\\notes\\${noteId}.mdxp`),
          kind: 'file',
        },
      ],
    };

    const text = writeWorkspaceFile(withProtected, 'D:\\team').text;

    expect(text).not.toContain('Bank details');
    expect(text).not.toContain(noteId);
    expect(text).not.toContain('protected');
    expect(JSON.parse(text)).toMatchObject({ roots: ['docs', 'E:/shared'] });
  });

  it('reads no protected location from a file written elsewhere', () => {
    const text = JSON.stringify({
      format: 'mdx-workspace',
      formatVersion: 1,
      name: 'Shared',
      kind: 'markdownViewer',
      roots: ['docs', '.mdx-notes/protected'],
      favourites: [{ path: '.mdx-notes/protected/notes/a.mdxp', kind: 'file' }],
    });

    const reading = readWorkspaceFile(text, READ_OPTIONS);

    if (reading.outcome !== 'read') throw new Error('the file was not read');
    expect(reading.workspace.roots.map((root) => root.displayPath)).toEqual(['D:\\team\\docs']);
    expect(reading.workspace.favourites).toEqual([]);
  });

  it('relative paths resolve against the file folder, so a written file reads back the same', () => {
    const { text } = writeWorkspaceFile(HANDBOOK, 'D:\\team');

    const reading = readWorkspaceFile(text, READ_OPTIONS);

    expect(reading).toEqual({ outcome: 'read', workspace: HANDBOOK });
  });

  it('a file moved with its folder resolves against its new place', () => {
    const { text } = writeWorkspaceFile(HANDBOOK, 'D:\\team');

    const reading = readWorkspaceFile(text, { ...READ_OPTIONS, fileFolder: 'F:\\copy' });

    expect(reading.outcome === 'read' && reading.workspace.roots[0]?.displayPath).toBe('F:\\copy\\docs');
  });

  it.each([
    ['not JSON', '{ broken', 'notWorkspaceFile'],
    ['another format', '{"format":"mdx-favourites","version":1}', 'notWorkspaceFile'],
    ['no name', '{"format":"mdx-workspace","formatVersion":1,"kind":"markdownViewer"}', 'notWorkspaceFile'],
    [
      'a newer format',
      '{"format":"mdx-workspace","formatVersion":2,"name":"A","kind":"markdownViewer"}',
      'unsupportedVersion',
    ],
    [
      'an unknown kind',
      '{"format":"mdx-workspace","formatVersion":1,"name":"A","kind":"timeMachine"}',
      'unknownKind',
    ],
  ])('refuses %s with a reason', (_description, text, reason) => {
    expect(readWorkspaceFile(text, READ_OPTIONS)).toEqual({ outcome: 'refused', reason });
  });

  it('refuses a kind not built yet with a reason', () => {
    const withPlannedSpecViewer = WORKSPACE_KINDS.map((kind) =>
      kind.id === 'specViewer' ? { ...kind, availability: 'planned' as const } : kind,
    );
    const text = '{"format":"mdx-workspace","formatVersion":1,"name":"A","kind":"specViewer"}';

    expect(readWorkspaceFile(text, { ...READ_OPTIONS, kindRegistry: withPlannedSpecViewer })).toEqual({
      outcome: 'refused',
      reason: 'unknownKind',
    });
    expect(readWorkspaceFile(text, READ_OPTIONS).outcome).toBe('read');
  });

  it('refuses a file larger than 1 MB', () => {
    const oversized = `{"format":"mdx-workspace","name":"${'a'.repeat(MAX_WORKSPACE_FILE_BYTES)}"}`;

    expect(readWorkspaceFile(oversized, READ_OPTIONS)).toEqual({ outcome: 'refused', reason: 'tooLarge' });
  });

  it('reads a kind that is built in this version even while it is turned off', () => {
    const text = '{"format":"mdx-workspace","formatVersion":1,"name":"Journal","kind":"notes"}';

    expect(readWorkspaceFile(text, READ_OPTIONS).outcome).toBe('read');
  });

  it('reads a planned kind when the preview allows it', () => {
    const kinds = workspaceKindsFor({ allowsPlannedKindPreview: true });
    const text = '{"format":"mdx-workspace","formatVersion":1,"name":"Specs","kind":"specViewer"}';

    expect(readWorkspaceFile(text, { ...READ_OPTIONS, kindRegistry: kinds }).outcome).toBe('read');
  });

  it('drops entries it cannot read and keeps the rest', () => {
    const text = JSON.stringify({
      format: 'mdx-workspace',
      formatVersion: 1,
      name: ' Handbook ',
      kind: 'markdownViewer',
      roots: ['docs', 42],
      favourites: [
        { path: 'docs/a.md', kind: 'file' },
        { path: 'docs/b.md', kind: 'unknown' },
      ],
      settingsOverrides: { theme: 'dark', zoomPercent: 200 },
    });

    const reading = readWorkspaceFile(text, READ_OPTIONS);

    expect(reading.outcome === 'read' && reading.workspace).toMatchObject({
      name: 'Handbook',
      roots: [locationOfPath('D:\\team\\docs')],
      favourites: [{ kind: 'file', location: locationOfPath('D:\\team\\docs\\a.md') }],
      settingsOverrides: { theme: 'dark' },
    });
  });
});
