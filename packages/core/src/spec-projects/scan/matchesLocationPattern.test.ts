import { describe, expect, it } from 'vitest';
import { matchesLocationPattern } from './matchesLocationPattern';

describe('matchesLocationPattern', () => {
  it('matches every file below a whole-tree location', () => {
    expect(matchesLocationPattern('openspec/**', 'openspec/changes/add-tabs/.openspec.yaml')).toBe(true);
    expect(matchesLocationPattern('openspec/**', 'openspec')).toBe(false);
    expect(matchesLocationPattern('openspec/**', 'specs/a.md')).toBe(false);
  });

  it('matches one folder with a wildcard but not a hidden one', () => {
    expect(matchesLocationPattern('skills/*/SKILL.md', 'skills/review/SKILL.md')).toBe(true);
    expect(matchesLocationPattern('skills/*/SKILL.md', 'skills/.cache/SKILL.md')).toBe(false);
    expect(matchesLocationPattern('skills/*/SKILL.md', 'skills/a/b/SKILL.md')).toBe(false);
  });

  it('matches zero or more folders with any depth in the middle', () => {
    const pattern = '.github/instructions/**/*.instructions.md';

    expect(matchesLocationPattern(pattern, '.github/instructions/api.instructions.md')).toBe(true);
    expect(matchesLocationPattern(pattern, '.github/instructions/a/b/api.instructions.md')).toBe(true);
    expect(matchesLocationPattern(pattern, '.github/instructions/api.md')).toBe(false);
  });

  it('matches names in any case and treats other characters literally', () => {
    expect(matchesLocationPattern('docs/adr/**', 'Docs/ADR/0001-use-x.md')).toBe(true);
    expect(matchesLocationPattern('*.mdc', 'a.mdc')).toBe(true);
    expect(matchesLocationPattern('*.mdc', 'amdc')).toBe(false);
  });
});
