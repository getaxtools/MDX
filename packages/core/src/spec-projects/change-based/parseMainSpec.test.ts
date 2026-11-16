import { describe, expect, it } from 'vitest';
import { parseMainSpec } from './parseMainSpec';
import { requirementTextOf } from './requirementBlocks';

describe('parseMainSpec', () => {
  it('reads the purpose and the requirements of a spec', () => {
    const spec = parseMainSpec(
      [
        '# tabs Specification',
        '',
        '## Purpose ##',
        'Lets a user keep documents open in tabs.',
        '',
        '## Requirements',
        '### Requirement: Open tabs',
        '**ID**: TAB-1',
        'The viewer SHALL open each document in a tab.',
        '#### Scenario: Open',
        '- **WHEN** opened',
        '- **THEN** shown',
        '## Notes',
        '### Requirement: Not in the section',
      ].join('\n'),
    );

    expect(spec.purpose).toEqual({ text: 'Lets a user keep documents open in tabs.', line: 3 });
    expect(spec.requirementsLine).toBe(6);
    expect(spec.requirements.map((block) => [block.name, block.line])).toEqual([['Open tabs', 7]]);
    expect(requirementTextOf(spec.requirements[0] ?? { name: '', line: 0, lines: [] })).toBe(
      'The viewer SHALL open each document in a tab.',
    );
  });

  it('keeps a metadata line as the text when it is the only text', () => {
    const spec = parseMainSpec(
      ['## Purpose', 'Text.', '## Requirements', '### Requirement: A', '**Constraint**: It MUST hold.'].join(
        '\n',
      ),
    );

    expect(requirementTextOf(spec.requirements[0] ?? { name: '', line: 0, lines: [] })).toBe(
      '**Constraint**: It MUST hold.',
    );
  });

  it('ignores a Requirements heading inside fenced code', () => {
    const spec = parseMainSpec(['## Purpose', 'Text.', '```', '## Requirements', '```'].join('\n'));

    expect(spec.requirementsLine).toBeUndefined();
    expect(spec.requirements).toEqual([]);
  });

  it('has no purpose when no heading is titled Purpose', () => {
    expect(parseMainSpec('# Title\n\n## Requirements\n').purpose).toBeUndefined();
  });
});
