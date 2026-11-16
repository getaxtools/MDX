import { describe, expect, it } from 'vitest';
import { parseDeltaSpec } from './parseDeltaSpec';
import { scenariosOf } from './requirementBlocks';

const SCENARIO = ['#### Scenario: Works', '- **WHEN** used', '- **THEN** it works'];

function lines(...parts: readonly string[]): string {
  return parts.join('\n');
}

describe('parseDeltaSpec', () => {
  it('reads each delta section with its requirements', () => {
    const delta = parseDeltaSpec(
      lines(
        '## ADDED Requirements',
        '### Requirement: Pin tabs',
        'The viewer SHALL pin.',
        ...SCENARIO,
        '## REMOVED Requirements',
        '### Requirement: Old layout',
      ),
    );

    expect(delta.sections.map((section) => [section.operation, section.line])).toEqual([
      ['added', 1],
      ['removed', 7],
    ]);
    expect(delta.added.map((block) => [block.name, block.line])).toEqual([['Pin tabs', 2]]);
    expect(delta.removed).toEqual([{ name: 'Old layout', line: 8 }]);
  });

  it('ignores requirement headers inside fenced code', () => {
    const delta = parseDeltaSpec(
      lines(
        '## ADDED Requirements',
        '```markdown',
        '### Requirement: In backticks',
        '```',
        '~~~~',
        '### Requirement: In tildes',
        '~~~',
        '~~~~',
        '### Requirement: Real',
        'Text SHALL be.',
      ),
    );

    expect(delta.added.map((block) => block.name)).toEqual(['Real']);
  });

  it('does not treat a backtick run with a backtick in its info string as a fence', () => {
    const delta = parseDeltaSpec(
      lines('## ADDED Requirements', '```npm test```', '### Requirement: After inline code'),
    );

    expect(delta.added.map((block) => block.name)).toEqual(['After inline code']);
  });

  it('reads a file with a byte order mark and Windows line breaks', () => {
    const delta = parseDeltaSpec(
      '\uFEFF## ADDED Requirements\r\n### Requirement: First\r\nText SHALL be.\r\n',
    );

    expect(delta.added.map((block) => [block.name, block.line])).toEqual([['First', 2]]);
    expect(delta.added[0]?.lines).toEqual(['### Requirement: First', 'Text SHALL be.']);
  });

  it('drops closing # runs from section titles and requirement names, but keeps C#', () => {
    const delta = parseDeltaSpec(
      lines('## ADDED Requirements ##', '### Requirement: Tabs ###', '### Requirement: Support C#'),
    );

    expect(delta.added.map((block) => block.name)).toEqual(['Tabs', 'Support C#']);
  });

  it('keeps a scenario header with an empty body out of the scenario count', () => {
    const delta = parseDeltaSpec(
      lines(
        '## ADDED Requirements',
        '### Requirement: A',
        'Text SHALL be.',
        '#### Scenario: Empty',
        '',
        ...SCENARIO,
      ),
    );

    const scenarios = scenariosOf(delta.added[0] ?? { name: '', line: 0, lines: [] });
    expect(scenarios.map((scenario) => [scenario.name, scenario.hasBody])).toEqual([
      ['Empty', false],
      ['Works', true],
    ]);
  });

  it('reads rename pairs with any bullet or none', () => {
    const delta = parseDeltaSpec(
      lines(
        '## RENAMED Requirements',
        '- FROM: `### Requirement: A`',
        '- TO: `### Requirement: B`',
        '* FROM: `### Requirement: C`',
        '* TO: `### Requirement: D`',
        '+ FROM: ### Requirement: E',
        '+ TO: ### Requirement: F',
        'FROM: `### Requirement: G`',
        'TO: `### Requirement: H`',
      ),
    );

    expect(delta.renamed.map((rename) => `${rename.from.name}>${rename.to.name}`)).toEqual([
      'A>B',
      'C>D',
      'E>F',
      'G>H',
    ]);
    expect(delta.unpairedRenames).toEqual([]);
  });

  it('reports a FROM displaced by another FROM and a TO without a FROM as unpaired', () => {
    const delta = parseDeltaSpec(
      lines(
        '## RENAMED Requirements',
        '- FROM: `### Requirement: A`',
        '- FROM: `### Requirement: B`',
        '- TO: `### Requirement: C`',
        '- TO: `### Requirement: D`',
      ),
    );

    expect(delta.renamed.map((rename) => `${rename.from.name}>${rename.to.name}`)).toEqual(['B>C']);
    expect(delta.unpairedRenames).toEqual([
      { name: 'A', line: 2, side: 'from' },
      { name: 'D', line: 5, side: 'to' },
    ]);
  });

  it('reads removed requirements as headers or as bullets with any marker', () => {
    const delta = parseDeltaSpec(
      lines(
        '## REMOVED Requirements',
        '### Requirement: A',
        '- ### Requirement: B',
        '* `### Requirement: C`',
        '+ ### Requirement: D',
      ),
    );

    expect(delta.removed.map((entry) => entry.name)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('adds a repeated or differently cased section heading to the same operation', () => {
    const delta = parseDeltaSpec(
      lines('## ADDED Requirements', '### Requirement: A', '## Added Requirements', '### Requirement: B'),
    );

    expect(delta.added.map((block) => block.name)).toEqual(['A', 'B']);
  });

  it('lists requirements outside the delta sections with the section they sit under', () => {
    const delta = parseDeltaSpec(
      lines(
        '### Requirement: Above',
        '## Notes',
        '### Requirement: In notes',
        '<!-- ### Requirement: Commented out -->',
        '## ADDED Requirements',
        '### Requirement: Fine',
      ),
    );

    expect(delta.orphanedRequirements).toEqual([
      { name: 'Above', line: 1, section: undefined },
      { name: 'In notes', line: 3, section: 'Notes' },
    ]);
  });
});
