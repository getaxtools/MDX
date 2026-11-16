import { describe, expect, it } from 'vitest';
import { applyDelta, type DeltaApplication } from './applyDelta';
import { parseMainSpec } from './parseMainSpec';

function requirement(name: string, ...scenarios: readonly string[]): string[] {
  return [
    `### Requirement: ${name}`,
    `The viewer SHALL support ${name.toLowerCase()}.`,
    '',
    ...scenarios.flatMap((scenario) => [
      `#### Scenario: ${scenario}`,
      '- **WHEN** used',
      '- **THEN** it works',
      '',
    ]),
  ];
}

const CURRENT = [
  '# tabs Specification',
  '',
  '## Purpose',
  '',
  'Lets a user keep documents open in tabs and move between them.',
  '',
  '## Requirements',
  '',
  ...requirement('A', 'A works'),
  ...requirement('B', 'B works', 'B again'),
].join('\n');

function applied(application: DeltaApplication) {
  if (application.outcome !== 'applied') throw new Error(`refused: ${JSON.stringify(application.refusal)}`);
  return application.spec;
}

function requirementNamesOf(text: string): string[] {
  return parseMainSpec(text).requirements.map((block) => block.name);
}

function apply(deltaLines: readonly string[], currentSpecText: string = CURRENT): DeltaApplication {
  return applyDelta({
    capability: 'tabs',
    changeName: 'add-pins',
    deltaText: deltaLines.join('\n'),
    currentSpecText,
  });
}

function applyToNewCapability(deltaLines: readonly string[]): DeltaApplication {
  return applyDelta({ capability: 'tabs', changeName: 'add-pins', deltaText: deltaLines.join('\n') });
}

describe('applyDelta', () => {
  it('keeps the current order, modifies in place and appends added requirements, labelling each', () => {
    const spec = applied(
      apply([
        '## MODIFIED Requirements',
        ...requirement('B', 'B works', 'B again', 'B once more'),
        '## ADDED Requirements',
        ...requirement('C', 'C works'),
      ]),
    );

    expect(requirementNamesOf(spec.text)).toEqual(['A', 'B', 'C']);
    expect(spec.changedRequirements).toEqual([
      { name: 'B', isAdded: false, isModified: true, renamedFrom: undefined },
      { name: 'C', isAdded: true, isModified: false },
    ]);
  });

  it('renames before it modifies, so a modification names the new header', () => {
    const spec = applied(
      apply([
        '## MODIFIED Requirements',
        ...requirement('Bee', 'B works', 'B again', 'B extra'),
        '## RENAMED Requirements',
        '- FROM: `### Requirement: B`',
        '- TO: `### Requirement: Bee`',
      ]),
    );

    expect(requirementNamesOf(spec.text)).toEqual(['A', 'Bee']);
    expect(spec.changedRequirements).toEqual([
      { name: 'Bee', isAdded: false, isModified: true, renamedFrom: 'B' },
    ]);
  });

  it('treats the removal of a missing requirement as already done', () => {
    const spec = applied(
      apply([
        '## REMOVED Requirements',
        '- ### Requirement: Never there',
        '## ADDED Requirements',
        ...requirement('C', 'C works'),
      ]),
    );

    expect(requirementNamesOf(spec.text)).toEqual(['A', 'B', 'C']);
    expect(spec.skipped).toEqual([{ kind: 'removedNotFound', requirement: 'Never there' }]);
  });

  it('refuses to remove a requirement written in another case', () => {
    const application = apply(['## REMOVED Requirements', '- ### Requirement: b']);

    expect(application).toEqual({
      outcome: 'refused',
      refusal: { reason: 'removedMisspelled', requirement: 'b', detail: 'B', line: 2 },
    });
  });

  it('refuses an added requirement that already exists with other text', () => {
    const application = apply([
      '## ADDED Requirements',
      '### Requirement: A',
      'The viewer SHALL do A differently.',
      '#### Scenario: A',
      '- **WHEN** x',
      '- **THEN** y',
    ]);

    expect(application).toMatchObject({
      outcome: 'refused',
      refusal: { reason: 'addedExists', requirement: 'A' },
    });
  });

  it('skips an added requirement the spec already holds word for word', () => {
    const spec = applied(apply(['## ADDED Requirements', ...requirement('A', 'A works')]));

    expect(spec.changedRequirements).toEqual([]);
  });

  it('refuses a modified requirement that drops a scenario, naming it', () => {
    const application = apply(['## MODIFIED Requirements', ...requirement('B', 'B works')]);

    expect(application).toMatchObject({
      outcome: 'refused',
      refusal: { reason: 'modifiedDropsScenario', requirement: 'B', detail: 'B again' },
    });
  });

  it('refuses a modified requirement that is not in the spec, naming it', () => {
    const application = apply(['## MODIFIED Requirements', ...requirement('Export data', 'Export')]);

    expect(application).toMatchObject({
      outcome: 'refused',
      refusal: { reason: 'modifiedNotFound', requirement: 'Export data' },
    });
  });

  it('starts a new capability from a skeleton with the delta purpose', () => {
    const spec = applied(
      applyToNewCapability([
        '## Purpose',
        '',
        'Lets a user pin the tabs they come back to.',
        '',
        '## ADDED Requirements',
        ...requirement('Pin', 'Pin works'),
      ]),
    );

    expect(spec.isNewCapability).toBe(true);
    expect(
      spec.text.startsWith(
        '# tabs Specification\n\n## Purpose\nLets a user pin the tabs they come back to.\n\n## Requirements\n',
      ),
    ).toBe(true);
    expect(requirementNamesOf(spec.text)).toEqual(['Pin']);
  });

  it('writes the placeholder purpose for a new capability whose delta has none', () => {
    const spec = applied(applyToNewCapability(['## ADDED Requirements', ...requirement('Pin', 'Pin works')]));

    expect(parseMainSpec(spec.text).purpose?.text).toBe(
      'TBD - created by archiving change add-pins. Update Purpose after archive.',
    );
  });

  it('refuses a modification or a rename for a new capability', () => {
    expect(applyToNewCapability(['## MODIFIED Requirements', ...requirement('A', 'A works')])).toEqual({
      outcome: 'refused',
      refusal: { reason: 'changeOnNewCapability' },
    });
  });

  it('refuses a delta whose rename has no TO line before touching the spec', () => {
    expect(apply(['## RENAMED Requirements', '- FROM: `### Requirement: A`'])).toMatchObject({
      outcome: 'refused',
      refusal: { reason: 'unpairedRename', requirement: 'A' },
    });
  });

  it('refuses to update a spec that repeats a requirement', () => {
    const current = `${CURRENT}\n${requirement('A', 'A twice').join('\n')}`;

    expect(apply(['## ADDED Requirements', ...requirement('C', 'C works')], current)).toMatchObject({
      outcome: 'refused',
      refusal: { reason: 'currentSpecInvalid' },
    });
  });
});
