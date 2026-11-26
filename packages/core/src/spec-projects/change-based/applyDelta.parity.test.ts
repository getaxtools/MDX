import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyDelta, type DeltaApplication } from './applyDelta';
import type { DeltaRefusalReason } from './deltaRefusals';

const FIXTURES = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'tests',
  'fixtures',
  'spec-projects',
);
const PROJECT = join(FIXTURES, 'delta-apply', 'openspec');

type ToolResult =
  | {
      readonly outcome: 'applied';
      readonly warnings: readonly string[];
      readonly specs: Readonly<Record<string, string>>;
    }
  | { readonly outcome: 'refused'; readonly message: string };

/** How the tool words each refusal the fixture project triggers. */
const TOOL_REFUSALS: readonly (readonly [DeltaRefusalReason, RegExp])[] = [
  ['addedExists', /ADDED failed for header ".*" - already exists/],
  ['modifiedDropsScenario', /current spec contains scenario\(s\) not present in the modified block/],
  ['changeOnNewCapability', /target spec does not exist; only ADDED requirements are allowed/],
  ['modifiedNotFound', /MODIFIED failed for header ".*" - not found/],
];

const expected = JSON.parse(readFileSync(join(FIXTURES, 'delta-apply-cli-results.json'), 'utf8')) as {
  readonly changes: Readonly<Record<string, ToolResult>>;
};

function currentSpecOf(capability: string): string | undefined {
  try {
    return readFileSync(join(PROJECT, 'specs', capability, 'spec.md'), 'utf8');
  } catch {
    return undefined;
  }
}

/** Each fixture change holds one delta, so its result is that one capability's. */
function applyChange(changeName: string): {
  readonly capability: string;
  readonly application: DeltaApplication;
} {
  const specsFolder = join(PROJECT, 'changes', changeName, 'specs');
  const capability = readdirSync(specsFolder)[0] ?? '';
  const deltaText = readFileSync(join(specsFolder, capability, 'spec.md'), 'utf8');
  const currentSpecText = currentSpecOf(capability);
  return { capability, application: applyDelta({ capability, changeName, deltaText, currentSpecText }) };
}

describe('applying a delta agrees with the spec tool 2.0.0 archive on the fixture project', () => {
  it.each(Object.entries(expected.changes))('%s', (changeName, toolResult) => {
    const { capability, application } = applyChange(changeName);

    if (toolResult.outcome === 'refused') {
      const reason = TOOL_REFUSALS.find(([, wording]) => wording.test(toolResult.message))?.[0];
      expect(application).toMatchObject({ outcome: 'refused', refusal: { reason } });
      return;
    }
    expect(application.outcome).toBe('applied');
    if (application.outcome !== 'applied') return;
    expect(application.spec.text).toBe(toolResult.specs[capability]);
    const skippedRemovals = toolResult.warnings.filter((warning) =>
      warning.includes('treating it as already removed'),
    );
    expect(application.spec.skipped).toHaveLength(skippedRemovals.length);
  });
});
