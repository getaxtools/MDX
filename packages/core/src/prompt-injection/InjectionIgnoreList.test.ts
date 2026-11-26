import { describe, expect, it } from 'vitest';
import { restoreAppState, toPersistedAppState } from '../session/persistedAppState';
import { readWorkspaceFile, writeWorkspaceFile } from '../workspaces/workspaceFile';
import { WORKSPACE_KINDS } from '../workspace-kinds/workspaceKinds';
import { filterIgnoredFindings, ignoreEntryFor } from './ignoreFindings';
import { InjectionIgnoreList, MAX_IGNORE_ENTRIES } from './InjectionIgnoreList';
import { Ruleset } from './Ruleset';
import { runInjectionCheck } from './runInjectionCheck';

const DOCUMENT_KEY = 'c:\\docs\\readme.md';
const SECRET_TEXT = 'Visible private\u200Bremark nobody should store';
const NOW = () => 1_000;

function zeroWidthFinding() {
  const result = runInjectionCheck({ text: SECRET_TEXT, origin: 'local', trigger: 'manual' });
  const finding = result.findings.find((candidate) => candidate.ruleId === 'char-zero-width');
  if (!finding) throw new Error('The fixture must hold a zero-width finding');
  return { result, finding };
}

function savedRoundTrip(list: InjectionIgnoreList): InjectionIgnoreList {
  const empty = restoreAppState(undefined);
  const saved: unknown = JSON.parse(
    JSON.stringify(toPersistedAppState({ ...empty, injectionIgnoreList: list })),
  );
  return restoreAppState(saved).injectionIgnoreList;
}

describe('InjectionIgnoreList', () => {
  it('keeps an ignored finding ignored after the state is saved and restored', () => {
    const { result, finding } = zeroWidthFinding();
    const list = InjectionIgnoreList.empty().add(
      ignoreEntryFor(finding, 'finding', { text: SECRET_TEXT, documentKey: DOCUMENT_KEY, now: NOW }),
    );

    const restored = savedRoundTrip(list);
    const filtered = filterIgnoredFindings(result, restored.entries(), {
      text: SECRET_TEXT,
      documentKey: DOCUMENT_KEY,
      ruleset: Ruleset.bundled(),
    });

    expect(filtered.result.ignoredCount).toBe(1);
    expect(filtered.result.findings).not.toContainEqual(finding);
  });

  it('saves rule ids and hashes but no document text', () => {
    const { finding } = zeroWidthFinding();
    const list = InjectionIgnoreList.empty()
      .add(ignoreEntryFor(finding, 'finding', { text: SECRET_TEXT, documentKey: DOCUMENT_KEY, now: NOW }))
      .add(
        ignoreEntryFor(finding, 'ruleInDocument', { text: SECRET_TEXT, documentKey: DOCUMENT_KEY, now: NOW }),
      );

    const savedJson = JSON.stringify(
      toPersistedAppState({ ...restoreAppState(undefined), injectionIgnoreList: list }),
    );

    expect(savedJson).toContain('char-zero-width');
    expect(savedJson).not.toContain('remark');
    expect(savedJson).not.toContain('nobody should store');
  });

  it('saves nothing for an empty list, so earlier saved state stays the same', () => {
    expect(toPersistedAppState(restoreAppState(undefined))).not.toHaveProperty('injectionIgnoreEntries');
  });

  it('drops saved entries that do not parse and keeps the rest', () => {
    const valid = {
      ruleId: 'char-zero-width',
      documentKey: DOCUMENT_KEY,
      evidenceHash: '0123456789abcdef',
      scope: 'finding',
      createdAt: 1,
    };

    const list = InjectionIgnoreList.fromSaved([
      valid,
      { ...valid, scope: 'everything' },
      { ...valid, evidenceHash: 'not a hash' },
      { ...valid, scope: 'ruleInDocument' },
      { ...valid, documentKey: '' },
      'text',
    ]);

    expect(list.entries()).toEqual([valid]);
  });

  it(`keeps only the ${String(MAX_IGNORE_ENTRIES)} newest entries`, () => {
    const saved = Array.from({ length: MAX_IGNORE_ENTRIES + 3 }, (_, index) => ({
      ruleId: 'hidden-html-comment',
      documentKey: `c:\\docs\\${String(index)}.md`,
      evidenceHash: '',
      scope: 'ruleInDocument',
      createdAt: index,
    }));

    const entries = InjectionIgnoreList.fromSaved(saved).entries();

    expect(entries).toHaveLength(MAX_IGNORE_ENTRIES);
    expect(entries[0]?.createdAt).toBe(3);
  });

  it('adds the same entry only once', () => {
    const { finding } = zeroWidthFinding();
    const entry = ignoreEntryFor(finding, 'finding', {
      text: SECRET_TEXT,
      documentKey: DOCUMENT_KEY,
      now: NOW,
    });
    const once = InjectionIgnoreList.empty().add(entry);

    expect(once.add({ ...entry, createdAt: 2_000 })).toBe(once);
  });

  it('shows a finding again by removing the entries that hide it', () => {
    const { finding } = zeroWidthFinding();
    const context = { text: SECRET_TEXT, documentKey: DOCUMENT_KEY, now: NOW };
    const list = InjectionIgnoreList.empty()
      .add(ignoreEntryFor(finding, 'finding', context))
      .add(ignoreEntryFor(finding, 'ruleInDocument', context));

    const shownAgain = list.withoutEntriesHiding(finding, { ...context, ruleset: Ruleset.bundled() });

    expect(shownAgain.isEmpty()).toBe(true);
  });

  it('never takes ignore entries from a workspace file', () => {
    const written = writeWorkspaceFile(
      {
        name: 'Team',
        kindId: 'markdownViewer',
        icon: null,
        colour: null,
        roots: [],
        favourites: [],
        favouriteGroups: [],
        settingsOverrides: {},
      },
      'D:\team',
    );
    const withEntries = JSON.stringify({
      ...(JSON.parse(written.text) as object),
      injectionIgnoreEntries: [
        {
          ruleId: 'char-zero-width',
          documentKey: DOCUMENT_KEY,
          evidenceHash: '',
          scope: 'ruleInDocument',
          createdAt: 1,
        },
      ],
    });

    const reading = readWorkspaceFile(withEntries, { fileFolder: 'D:\team', kindRegistry: WORKSPACE_KINDS });

    expect(written.text).not.toContain('injectionIgnoreEntries');
    expect(reading.outcome).toBe('read');
    expect(JSON.stringify(reading)).not.toContain('char-zero-width');
  });
});
