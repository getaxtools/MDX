import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEC_SEARCH_FILTER, specSearchPathsOf, type SpecSearchScope } from './specSearchScope';

const PATHS = [
  'openspec/config.yaml',
  'openspec/specs/tabs/spec.md',
  'openspec/changes/add-pins/proposal.md',
  'openspec/changes/add-pins/tasks.md',
  'openspec/changes/archive/2026-10-01-add-tabs/proposal.md',
  'specs/001-albums/spec.md',
  'specs/001-albums/tasks.md',
  '.github/copilot-instructions.md',
  'web/GEMINI.md',
  '.cursor/rules/style.mdc',
];

function searchedIn(scope: SpecSearchScope, isArchiveIncluded = false): string[] {
  return specSearchPathsOf(PATHS, { scope, isArchiveIncluded });
}

describe('specSearchPathsOf', () => {
  it('searches every Markdown document except archived changes by default', () => {
    expect(specSearchPathsOf(PATHS, DEFAULT_SPEC_SEARCH_FILTER)).toEqual(
      PATHS.filter((path) => !path.endsWith('.yaml') && !path.includes('/archive/')),
    );
  });

  it('limits the search to specs, changes, tasks or agent instructions', () => {
    expect(searchedIn('specs')).toEqual(['openspec/specs/tabs/spec.md', 'specs/001-albums/spec.md']);
    expect(searchedIn('changes')).toEqual([
      'openspec/changes/add-pins/proposal.md',
      'openspec/changes/add-pins/tasks.md',
    ]);
    expect(searchedIn('tasks')).toEqual(['openspec/changes/add-pins/tasks.md', 'specs/001-albums/tasks.md']);
    expect(searchedIn('instructions')).toEqual([
      '.github/copilot-instructions.md',
      'web/GEMINI.md',
      '.cursor/rules/style.mdc',
    ]);
  });

  it('includes archived changes when the user asks for them', () => {
    expect(searchedIn('changes', true)).toContain('openspec/changes/archive/2026-10-01-add-tabs/proposal.md');
  });
});
