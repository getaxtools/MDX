import { describe, expect, it } from 'vitest';
import { checkMainSpec } from './checkMainSpec';

const REQUIREMENT = [
  '## Requirements',
  '### Requirement: Open tabs',
  'The viewer SHALL open tabs.',
  '#### Scenario: Open',
  '- **WHEN** opened',
  '- **THEN** shown',
];

function specWithPurpose(...purpose: readonly string[]): string {
  return ['# tabs Specification', '## Purpose', ...purpose, ...REQUIREMENT].join('\n');
}

describe('checkMainSpec', () => {
  it('finds nothing wrong with a well-formed spec', () => {
    expect(
      checkMainSpec(
        'spec.md',
        specWithPurpose('Lets a user keep documents open in tabs and move between them.'),
      ),
    ).toEqual([]);
  });

  it('warns about a purpose under 50 characters', () => {
    expect(checkMainSpec('spec.md', specWithPurpose('Tabs.'))).toEqual([
      expect.objectContaining({ rule: 'purposeTooShort', severity: 'warning', line: 2 }),
    ]);
  });

  it('warns about the placeholder purpose that archiving writes, on its line', () => {
    const findings = checkMainSpec(
      'spec.md',
      specWithPurpose('', 'TBD - created by archiving change add-tabs. Update Purpose after archive.'),
    );

    expect(findings).toEqual([expect.objectContaining({ rule: 'purposeIsPlaceholder', line: 4 })]);
  });

  it('treats a leading TBD or a punctuated todo as a placeholder, but not a Spanish sentence', () => {
    const shouted = checkMainSpec('spec.md', specWithPurpose('TBD write this later'));
    const punctuated = checkMainSpec('spec.md', specWithPurpose('todo - write this later'));
    const spanish = checkMainSpec(
      'spec.md',
      specWithPurpose('todo el mundo puede abrir documentos en pestanas aqui'),
    );

    expect(shouted.map((finding) => finding.rule)).toEqual(['purposeIsPlaceholder']);
    expect(punctuated.map((finding) => finding.rule)).toEqual(['purposeIsPlaceholder']);
    expect(spanish).toEqual([]);
  });

  it('warns about a requirement over 500 characters', () => {
    const spec = [
      '## Purpose',
      'Lets a user keep documents open in tabs and move between them.',
      '## Requirements',
      '### Requirement: Long',
      `The viewer SHALL ${'x'.repeat(500)}`,
      '#### Scenario: Open',
      '- **WHEN** opened',
      '- **THEN** shown',
    ].join('\n');

    expect(checkMainSpec('spec.md', spec)).toEqual([
      expect.objectContaining({ rule: 'requirementTooLong', line: 4 }),
    ]);
  });

  it('does not check a spec without a purpose', () => {
    expect(checkMainSpec('spec.md', ['# tabs', ...REQUIREMENT].join('\n'))).toEqual([]);
  });
});
