import type { DocumentLocation } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { fileArcEntries, type FileArcTreeRow } from './fileArcEntries';

function location(path: string): DocumentLocation {
  return {
    canonicalKey: path.toLowerCase(),
    displayPath: path,
    fileName: path.split('\\').at(-1) ?? path,
  };
}

function file(path: string): FileArcTreeRow {
  const found = location(path);
  return { label: found.fileName, file: found };
}

function folder(label: string, children?: readonly FileArcTreeRow[]): FileArcTreeRow {
  return children ? { label, children } : { label };
}

const NO_TABS: ReadonlySet<string> = new Set();

describe('fileArcEntries', () => {
  it('files follow the tree order', () => {
    const handbook = folder('Handbook', [
      file('C:\\Handbook\\README.md'),
      folder('docs', [file('C:\\Handbook\\docs\\install.md'), file('C:\\Handbook\\docs\\themes.md')]),
      file('C:\\Handbook\\CHANGELOG.md'),
    ]);

    const entries = fileArcEntries({ roots: [handbook], recentFiles: [], openTabKeys: NO_TABS });

    expect(entries.map((entry) => entry.name)).toEqual([
      'README.md',
      'install.md',
      'themes.md',
      'CHANGELOG.md',
    ]);
    expect(entries.map((entry) => entry.folderLabel)).toEqual([
      'Handbook',
      'Handbook › docs',
      'Handbook › docs',
      'Handbook',
    ]);
  });

  it('collapsed folders are left out', () => {
    const handbook = folder('Handbook', [folder('reference'), file('C:\\Handbook\\README.md')]);

    const entries = fileArcEntries({ roots: [handbook], recentFiles: [], openTabKeys: NO_TABS });

    expect(entries.map((entry) => entry.name)).toEqual(['README.md']);
  });

  it('a collapsed root lists nothing', () => {
    const entries = fileArcEntries({ roots: [folder('Handbook')], recentFiles: [], openTabKeys: NO_TABS });

    expect(entries).toEqual([]);
  });

  it('a workspace without folders lists its recent files', () => {
    const recentFiles = [location('C:\\Notes\\a.md'), location('D:\\Docs\\b.md')];

    const entries = fileArcEntries({ roots: [], recentFiles, openTabKeys: NO_TABS });

    expect(entries.map((entry) => [entry.name, entry.folderLabel])).toEqual([
      ['a.md', 'Notes'],
      ['b.md', 'Docs'],
    ]);
  });

  it('a file reached through two folders is listed once', () => {
    const outer = folder('Handbook', [folder('docs', [file('C:\\Handbook\\docs\\install.md')])]);
    const inner = folder('docs', [
      file('C:\\Handbook\\docs\\install.md'),
      file('C:\\Handbook\\docs\\themes.md'),
    ]);

    const entries = fileArcEntries({ roots: [outer, inner], recentFiles: [], openTabKeys: NO_TABS });

    expect(entries.map((entry) => [entry.name, entry.folderLabel])).toEqual([
      ['install.md', 'Handbook › docs'],
      ['themes.md', 'docs'],
    ]);
  });

  it('open entries are marked', () => {
    const handbook = folder('Handbook', [file('C:\\Handbook\\README.md'), file('C:\\Handbook\\install.md')]);

    const entries = fileArcEntries({
      roots: [handbook],
      recentFiles: [],
      openTabKeys: new Set(['c:\\handbook\\readme.md']),
    });

    expect(entries.map((entry) => entry.isOpenInTab)).toEqual([true, false]);
  });

  it('a note with child notes comes before its children', () => {
    const projects: FileArcTreeRow = {
      label: 'Projects',
      file: location('E:\\Notes\\Projects.md'),
      children: [file('E:\\Notes\\Projects\\MDX roadmap.md')],
    };

    const entries = fileArcEntries({
      roots: [folder('Notes', [projects])],
      recentFiles: [],
      openTabKeys: NO_TABS,
    });

    expect(entries.map((entry) => entry.name)).toEqual(['Projects', 'MDX roadmap.md']);
  });
});
