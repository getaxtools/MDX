import type { SpecProjectManifest } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { decisionRecordOf } from './folderSpecSummaries';
import { activeTaskDocumentsOf, specProjectsOverview } from './specProjectsOverview';

const ROOT = 'C:\\Projects\\shop';

function manifestOf(paths: readonly string[]): SpecProjectManifest {
  return {
    root: { canonicalKey: ROOT.toLowerCase(), displayPath: ROOT, fileName: 'shop' },
    folders: [],
    files: paths.map((path) => ({ path, sizeBytes: 1, modifiedAtMs: 1, text: null })),
    links: [],
    isIncomplete: false,
  };
}

describe('requirements, design and tasks folders', () => {
  it('marks a missing design and reads task progress', () => {
    const manifest = manifestOf(['.kiro/specs/checkout/requirements.md', '.kiro/specs/checkout/tasks.md']);
    const texts = new Map([['.kiro/specs/checkout/tasks.md', '- [x] 1. Cart\n- [ ] 2. Pay']]);

    const [project] = specProjectsOverview(manifest, texts);

    expect(project?.folderSpecs).toEqual([
      {
        name: 'checkout',
        folder: '.kiro/specs/checkout',
        isBugfix: false,
        requirements: '.kiro/specs/checkout/requirements.md',
        design: undefined,
        tasks: '.kiro/specs/checkout/tasks.md',
        progress: { done: 1, total: 2 },
      },
    ]);
  });

  it('reads a bug fix spec, whose bug analysis takes the place of requirements', () => {
    const [project] = specProjectsOverview(manifestOf(['.kiro/specs/login-crash/bugfix.md']));

    expect(project?.folderSpecs[0]).toMatchObject({
      isBugfix: true,
      requirements: '.kiro/specs/login-crash/bugfix.md',
    });
  });
});

describe('decision records', () => {
  it('reads the status and date from front matter, and the title from the first heading', () => {
    const text = '---\nstatus: accepted\ndate: 2026-10-17\n---\n\n# Use SQLite for local data\n\nText.';

    expect(decisionRecordOf('0003', 'docs/decisions/0003-use-sqlite.md', text)).toEqual({
      number: '0003',
      path: 'docs/decisions/0003-use-sqlite.md',
      title: 'Use SQLite for local data',
      status: 'accepted',
      date: '2026-10-17',
    });
  });

  it('reads the status from a Status section and the date from a Date line', () => {
    const text =
      '# 2. Record decisions\r\n\r\nDate: 2026-01-12\r\n\r\n## Status\r\n\r\nSuperseded by 5\r\n\r\n## Context\r\n';

    expect(decisionRecordOf('0002', 'adr/0002-record-decisions.md', text)).toMatchObject({
      title: 'Record decisions',
      status: 'Superseded by 5',
      date: '2026-01-12',
    });
  });

  it('lists the records of a project and reads them for their details', () => {
    const manifest = manifestOf(['adr/0001-use-tauri.md']);
    const texts = new Map([['adr/0001-use-tauri.md', '# Use Tauri\n\n## Status\n\nAccepted\n']]);

    const [project] = specProjectsOverview(manifest, texts);

    expect(project?.decisionRecords).toEqual([
      {
        number: '0001',
        path: 'adr/0001-use-tauri.md',
        title: 'Use Tauri',
        status: 'Accepted',
        date: undefined,
      },
    ]);
    expect(activeTaskDocumentsOf(project ? [project] : [])).toEqual(['adr/0001-use-tauri.md']);
  });
});
