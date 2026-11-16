import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkChange } from './checkChange';
import { checkMainSpec } from './checkMainSpec';
import type { StructuralFinding, StructuralRule } from './structuralFindings';

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
const PROJECT = join(FIXTURES, 'change-checks', 'openspec');

interface ToolIssue {
  readonly level: 'ERROR' | 'WARNING' | 'INFO';
  readonly path: string;
  readonly line?: number;
  readonly message: string;
}

interface ToolItem {
  readonly type: 'change' | 'spec';
  readonly id: string;
  readonly issues: readonly ToolIssue[];
}

/** How each covered rule is worded by the tool; issues that match none are outside the checked subset. */
const TOOL_WORDING: readonly (readonly [StructuralRule, RegExp])[] = [
  ['deltaFileWithoutSections', /^No delta sections found/],
  ['deltaSectionsWithoutRequirements', /^Delta sections .* were found, but no requirement entries parsed/],
  ['deltaFileAtSpecsRoot', /^Delta spec found at specs\/spec\.md\./],
  [
    'deltaFileNotNamedSpec',
    /^Delta spec found at specs\/.*Delta specs must be a spec\.md inside a capability folder/,
  ],
  ['requirementUnderUnknownSection', /^Requirement ".*" is under ".*", which is not a delta section/],
  ['duplicateRequirement', /^Duplicate requirement in /],
  ['duplicateRename', /^Duplicate (?:FROM|TO) in RENAMED/],
  ['requirementInTwoSections', /^Requirement present in both /],
  ['modifiedUsesRenamedName', /^MODIFIED references old name from RENAMED/],
  ['renameCollidesWithAdded', /^RENAMED TO collides with ADDED/],
  ['unpairedRename', /^RENAMED (?:FROM|TO): ".*" has no matching/],
  ['requirementWithoutText', /is missing requirement text$|must contain SHALL or MUST/],
  ['requirementWithoutScenario', /must include at least one scenario/],
  ['modifiedDropsScenario', /omits scenario\(s\) the current spec still has/],
  ['changeWithoutDeltas', /^Change must have at least one delta/],
  ['skipSpecsWithDeltaFiles', /^skip_specs is set in \.openspec\.yaml but spec files exist/],
  ['skipSpecsWithInvalidMetadata', /^skip_specs is set but \.openspec\.yaml is not valid/],
  ['requirementWithoutShallOrMust', /should contain SHALL or MUST/],
  ['addedRequirementTooLong', /^ADDED ".*": Requirement text is very long/],
  ['scenarioWithoutSteps', /scenario ".*" is missing (?:a WHEN|a THEN)/],
  ['tasksWithoutCheckboxes', /counts as 0 tasks/],
  ['taskOutsideItsGroup', /^Task ".*" is under group/],
  ['duplicateTaskNumber', /^Task ID ".*" is duplicated/],
  ['purposeTooShort', /^Purpose section is too brief/],
  ['purposeIsPlaceholder', /^Purpose section is still a placeholder/],
  ['requirementTooLong', /^Requirement text is very long/],
  ['unknownMetadataKey', /^Unrecognized key name/],
];

const SEVERITY_OF_LEVEL = { ERROR: 'error', WARNING: 'warning', INFO: 'info' } as const;

function filesBelow(folder: string, prefix = ''): Map<string, string> {
  const files = new Map<string, string>();
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      for (const [path, text] of filesBelow(join(folder, entry.name), `${relative}/`)) files.set(path, text);
    } else {
      files.set(relative, readFileSync(join(folder, entry.name), 'utf8'));
    }
  }
  return files;
}

function currentSpecs(): Map<string, string> {
  const specs = new Map<string, string>();
  for (const [path, text] of filesBelow(join(PROJECT, 'specs'))) {
    if (path.endsWith('/spec.md')) specs.set(path.slice(0, -'/spec.md'.length), text);
  }
  return specs;
}

function findingsFor(item: ToolItem): StructuralFinding[] {
  if (item.type === 'spec')
    return checkMainSpec('spec.md', readFileSync(join(PROJECT, 'specs', item.id, 'spec.md'), 'utf8'));
  return checkChange({ files: filesBelow(join(PROJECT, 'changes', item.id)), currentSpecs: currentSpecs() });
}

/** Where the tool reports a finding: delta files relative to the change's `specs`, change-wide ones as `file`. */
function toolPathOf(item: ToolItem, finding: StructuralFinding): string {
  if (item.type === 'spec') return '';
  if (finding.path === '') return 'file';
  return finding.path.startsWith('specs/') ? finding.path.slice('specs/'.length) : finding.path;
}

function toolKeysOf(item: ToolItem): string[] {
  return item.issues.flatMap((issue) => {
    const rule = TOOL_WORDING.find(([, wording]) => wording.test(issue.message))?.[0];
    if (rule === undefined) return [];
    const path = item.type === 'spec' ? '' : issue.path;
    return [`${rule} ${SEVERITY_OF_LEVEL[issue.level]} ${path}`];
  });
}

const expected = JSON.parse(readFileSync(join(FIXTURES, 'change-checks-cli-findings.json'), 'utf8')) as {
  readonly items: readonly ToolItem[];
};

describe('structural checks agree with the spec tool 2.0.0 on the fixture project', () => {
  it.each(expected.items.map((item) => [`${item.type} ${item.id}`, item] as const))(
    '%s has the same findings',
    (_, item) => {
      const findings = findingsFor(item);

      const ourKeys = findings.map(
        (finding) => `${finding.rule} ${finding.severity} ${toolPathOf(item, finding)}`,
      );
      expect(ourKeys.sort()).toEqual(toolKeysOf(item).sort());
    },
  );

  it.each(expected.items.map((item) => [`${item.type} ${item.id}`, item] as const))(
    '%s reports the lines the tool reports',
    (_, item) => {
      const findings = findingsFor(item);

      for (const issue of item.issues.filter((toolIssue) => toolIssue.line !== undefined)) {
        const rule = TOOL_WORDING.find(([, wording]) => wording.test(issue.message))?.[0];
        if (rule === undefined) continue;
        expect(findings.some((finding) => finding.rule === rule && finding.line === issue.line)).toBe(true);
      }
    },
  );
});
