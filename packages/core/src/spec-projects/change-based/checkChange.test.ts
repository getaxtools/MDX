import { describe, expect, it } from 'vitest';
import { checkChange } from './checkChange';
import { failsCheck, type StructuralFinding } from './structuralFindings';

const METADATA = 'schema: spec-driven\n';
const SCENARIO = ['#### Scenario: Works', '- **WHEN** used', '- **THEN** it works'];
const CURRENT_TABS = [
  '# tabs Specification',
  '## Purpose',
  'Lets a user keep documents open in tabs and move between them.',
  '## Requirements',
  '### Requirement: Open tabs',
  'The viewer SHALL open tabs.',
  '#### Scenario: Open a file',
  '- **WHEN** opened',
  '- **THEN** shown',
  '#### Scenario: Open twice',
  '- **WHEN** opened again',
  '- **THEN** selected',
].join('\n');

function text(...lines: readonly string[]): string {
  return lines.join('\n');
}

function findingsOf(
  files: Readonly<Record<string, string>>,
  currentSpecs: Readonly<Record<string, string>> = {},
) {
  return checkChange({
    files: new Map(Object.entries({ '.openspec.yaml': METADATA, ...files })),
    currentSpecs: new Map(Object.entries(currentSpecs)),
  });
}

function deltaFindings(...lines: readonly string[]): StructuralFinding[] {
  return findingsOf({ 'specs/tabs/spec.md': text(...lines) }, { tabs: CURRENT_TABS });
}

function rulesOf(findings: readonly StructuralFinding[]): string[] {
  return findings.map((finding) => finding.rule);
}

const ADDED_PIN = [
  '## ADDED Requirements',
  '### Requirement: Pin tabs',
  'The viewer SHALL pin tabs.',
  ...SCENARIO,
];

describe('checkChange', () => {
  it('finds nothing wrong with a well-formed change', () => {
    expect(deltaFindings(...ADDED_PIN)).toEqual([]);
  });

  it('reports a delta file without delta sections', () => {
    expect(rulesOf(deltaFindings('# Notes', 'Nothing here.'))).toEqual([
      'changeWithoutDeltas',
      'deltaFileWithoutSections',
    ]);
  });

  it('reports delta sections without any requirement', () => {
    expect(deltaFindings('## ADDED Requirements', 'Some text.')).toEqual([
      expect.objectContaining({ rule: 'changeWithoutDeltas' }),
      expect.objectContaining({ rule: 'deltaSectionsWithoutRequirements', line: 1, detail: 'added' }),
    ]);
  });

  it('reports a delta file directly in the specs folder', () => {
    const findings = findingsOf({ 'specs/spec.md': text(...ADDED_PIN) });

    expect(rulesOf(findings)).toEqual(['deltaFileAtSpecsRoot']);
  });

  it('reports a delta file that is not named spec.md', () => {
    const findings = findingsOf({
      'specs/tabs/spec.md': text(...ADDED_PIN),
      'specs/tabs/more.md': text(...ADDED_PIN),
    });

    expect(findings).toEqual([
      expect.objectContaining({ rule: 'deltaFileNotNamedSpec', path: 'specs/tabs/more.md' }),
    ]);
  });

  it('reports a requirement under an unknown Requirements section, but not one under prose', () => {
    const findings = deltaFindings(
      ...ADDED_PIN,
      '## DEPRECATED Requirements',
      '### Requirement: Stray',
      '## Notes',
      '### Requirement: Example',
    );

    expect(findings).toEqual([
      expect.objectContaining({ rule: 'requirementUnderUnknownSection', subject: 'Stray', line: 8 }),
    ]);
  });

  it('reports a requirement repeated in one section', () => {
    const findings = deltaFindings(
      ...ADDED_PIN,
      '### Requirement: Pin tabs',
      'The viewer SHALL pin.',
      ...SCENARIO,
    );

    expect(findings).toEqual([
      expect.objectContaining({ rule: 'duplicateRequirement', line: 7, detail: 'added' }),
    ]);
  });

  it('reports a rename source named twice', () => {
    const findings = deltaFindings(
      '## RENAMED Requirements',
      '- FROM: `### Requirement: Open tabs`',
      '- TO: `### Requirement: Show tabs`',
      '- FROM: `### Requirement: Open tabs`',
      '- TO: `### Requirement: List tabs`',
    );

    expect(rulesOf(findings)).toEqual(['duplicateRename']);
  });

  it('reports a requirement in two sections', () => {
    const findings = deltaFindings(...ADDED_PIN, '## REMOVED Requirements', '- ### Requirement: Pin tabs');

    expect(findings).toEqual([
      expect.objectContaining({
        rule: 'requirementInTwoSections',
        subject: 'Pin tabs',
        detail: 'added,removed',
      }),
    ]);
  });

  it('reports a modified requirement that uses the old name of a rename', () => {
    const findings = deltaFindings(
      '## RENAMED Requirements',
      '- FROM: `### Requirement: Open tabs`',
      '- TO: `### Requirement: Show tabs`',
      '## MODIFIED Requirements',
      '### Requirement: Open tabs',
      'The viewer SHALL show tabs.',
      ...SCENARIO,
    );

    expect(rulesOf(findings)).toContain('modifiedUsesRenamedName');
  });

  it('reports a rename target that collides with an added requirement', () => {
    const findings = deltaFindings(
      ...ADDED_PIN,
      '## RENAMED Requirements',
      '- FROM: `### Requirement: Open tabs`',
      '- TO: `### Requirement: Pin tabs`',
    );

    expect(rulesOf(findings)).toEqual(['renameCollidesWithAdded']);
  });

  it('reports a rename without its other half', () => {
    const findings = deltaFindings(
      ...ADDED_PIN,
      '## RENAMED Requirements',
      '- FROM: `### Requirement: Open tabs`',
    );

    expect(findings).toEqual([
      expect.objectContaining({ rule: 'unpairedRename', line: 8, subject: 'Open tabs', detail: 'from' }),
    ]);
  });

  it('reports an added requirement without text', () => {
    const findings = deltaFindings('## ADDED Requirements', '### Requirement: Pin tabs', ...SCENARIO);

    expect(rulesOf(findings)).toEqual(['requirementWithoutText']);
  });

  it('reports an added requirement without a scenario and links to its line', () => {
    const findings = deltaFindings(
      '## ADDED Requirements',
      '',
      '### Requirement: Pin tabs',
      'The viewer SHALL pin.',
    );

    expect(findings).toEqual([
      expect.objectContaining({
        rule: 'requirementWithoutScenario',
        severity: 'error',
        line: 3,
        subject: 'Pin tabs',
      }),
    ]);
  });

  it('reports a modified requirement that drops a scenario of the current spec', () => {
    const findings = deltaFindings(
      '## MODIFIED Requirements',
      '### Requirement: Open tabs',
      'The viewer SHALL open tabs.',
      '#### Scenario: Open a file',
      '- **WHEN** opened',
      '- **THEN** shown',
    );

    expect(findings).toEqual([
      expect.objectContaining({ rule: 'modifiedDropsScenario', subject: 'Open tabs', detail: 'Open twice' }),
    ]);
  });

  it('compares a renamed and modified requirement with the block it was renamed from', () => {
    const findings = deltaFindings(
      '## RENAMED Requirements',
      '- FROM: `### Requirement: Open tabs`',
      '- TO: `### Requirement: Show tabs`',
      '## MODIFIED Requirements',
      '### Requirement: Show tabs',
      'The viewer SHALL show tabs.',
      ...SCENARIO,
    );

    expect(findings).toEqual([
      expect.objectContaining({ rule: 'modifiedDropsScenario', detail: 'Open a file\nOpen twice' }),
    ]);
  });

  it('reports a change without deltas that does not skip specs', () => {
    expect(rulesOf(findingsOf({ 'proposal.md': '# Proposal' }))).toEqual(['changeWithoutDeltas']);
  });

  it('accepts a change without deltas that skips specs', () => {
    expect(findingsOf({ '.openspec.yaml': `${METADATA}skip_specs: true\n` })).toEqual([]);
  });

  it('reports a change that skips specs but still has files under specs', () => {
    const findings = findingsOf({
      '.openspec.yaml': `${METADATA}skip_specs: true\n`,
      'specs/tabs/notes.txt': '',
    });

    expect(rulesOf(findings)).toEqual(['skipSpecsWithDeltaFiles']);
  });

  it('reports skip_specs that cannot be honoured because the metadata is not valid', () => {
    const findings = findingsOf({ '.openspec.yaml': 'skip_specs: true\n' });

    expect(rulesOf(findings).sort()).toEqual(['changeWithoutDeltas', 'skipSpecsWithInvalidMetadata']);
  });

  it('warns about requirement text without SHALL or MUST', () => {
    const findings = deltaFindings(
      '## ADDED Requirements',
      '### Requirement: Pin tabs',
      'The viewer pins tabs.',
      ...SCENARIO,
    );

    expect(findings).toEqual([
      expect.objectContaining({ rule: 'requirementWithoutShallOrMust', severity: 'warning' }),
    ]);
  });

  it('warns about an added description over 500 characters, which fails only in strict mode', () => {
    const description = `The viewer SHALL ${'keep pinned tabs in place. '.repeat(23)}`.slice(0, 620);

    const findings = deltaFindings(
      '## ADDED Requirements',
      '### Requirement: Pin tabs',
      description,
      ...SCENARIO,
    );

    expect(description).toHaveLength(620);
    expect(rulesOf(findings)).toEqual(['addedRequirementTooLong']);
    expect(failsCheck(findings, false)).toBe(false);
    expect(failsCheck(findings, true)).toBe(true);
  });

  it('warns about a labelled scenario without a trigger or an outcome, but not about other level-4 notes', () => {
    const findings = deltaFindings(
      '## ADDED Requirements',
      '### Requirement: Pin tabs',
      'The viewer SHALL pin tabs.',
      '#### Scenario: Only a result',
      '- **THEN** pinned',
      '#### Notes',
      'Plain text.',
    );

    expect(findings).toEqual([
      expect.objectContaining({
        rule: 'scenarioWithoutSteps',
        subject: 'Only a result',
        line: 4,
        detail: 'trigger',
      }),
    ]);
  });

  it('warns about tasks written without checkboxes', () => {
    const findings = findingsOf({
      'specs/tabs/spec.md': text(...ADDED_PIN),
      'tasks.md': text('# Tasks', '```', '- an example', '```', '- Add the command'),
    });

    expect(findings).toEqual([
      expect.objectContaining({ rule: 'tasksWithoutCheckboxes', path: 'tasks.md', line: 5 }),
    ]);
  });

  it('warns about a task numbered for another group', () => {
    const findings = findingsOf({
      'specs/tabs/spec.md': text(...ADDED_PIN),
      'tasks.md': text(
        '## 1. First',
        '- [ ] 1.1 Fine',
        '- [ ] 2.1 Wrong group',
        '## 02. Second',
        '- [ ] 2.2 Fine',
      ),
    });

    expect(findings).toEqual([
      expect.objectContaining({ rule: 'taskOutsideItsGroup', line: 3, subject: '2.1' }),
    ]);
  });

  it('warns about a task number used twice', () => {
    const findings = findingsOf({
      'specs/tabs/spec.md': text(...ADDED_PIN),
      'tasks.md': text('## 1. First', '- [ ] 1.1 Once', '- [x] 1.1 Twice'),
    });

    expect(findings).toEqual([
      expect.objectContaining({ rule: 'duplicateTaskNumber', line: 3, detail: '2' }),
    ]);
  });

  it('does not check task numbers for another schema', () => {
    const findings = findingsOf({
      '.openspec.yaml': 'schema: my-schema\n',
      'specs/tabs/spec.md': text(...ADDED_PIN),
      'tasks.md': text('## 1. First', '- [ ] 2.1 Wrong group'),
    });

    expect(findings).toEqual([]);
  });

  it('warns about unknown metadata keys', () => {
    const findings = findingsOf({
      '.openspec.yaml': `${METADATA}owner: someone\nx-tracker: T-1\n`,
      'specs/tabs/spec.md': text(...ADDED_PIN),
    });

    expect(findings).toEqual([expect.objectContaining({ rule: 'unknownMetadataKey', subject: 'owner' })]);
  });
});
