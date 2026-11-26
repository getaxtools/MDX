import { describe, expect, it } from 'vitest';
import type { FeatureFolder } from '../detection/detectSpecProjects';
import {
  clarificationMarkersIn,
  currentFeatureOf,
  featureDocumentsOf,
  featureStatusOf,
} from './featureDetails';

const FEATURES: readonly FeatureFolder[] = [
  { name: '001-photo-albums', folder: 'specs/001-photo-albums', number: 1 },
  { name: '002-sharing', folder: 'specs/002-sharing', number: 2 },
];

describe('feature details', () => {
  it('lists the documents a feature has and leaves the others undefined', () => {
    const documents = featureDocumentsOf('specs/002-sharing', [
      'specs/002-sharing/spec.md',
      'specs/002-sharing/plan.md',
      'specs/002-sharing/contracts/api.yaml',
      'specs/002-sharing/contracts/events.md',
      'specs/002-sharing/checklists/requirements.md',
    ]);

    expect(documents).toEqual({
      spec: 'specs/002-sharing/spec.md',
      plan: 'specs/002-sharing/plan.md',
      tasks: undefined,
      research: undefined,
      dataModel: undefined,
      quickstart: undefined,
      contracts: ['specs/002-sharing/contracts/api.yaml', 'specs/002-sharing/contracts/events.md'],
      checklists: ['specs/002-sharing/checklists/requirements.md'],
    });
  });

  it('reads the status line of a feature spec', () => {
    expect(
      featureStatusOf('# Feature\r\n\r\n**Feature Branch**: `002-sharing`\r\n**Status**: Draft\r\n'),
    ).toBe('Draft');
    expect(featureStatusOf('# Feature')).toBeUndefined();
  });

  it('finds each clarification marker with its line', () => {
    const text =
      'Users log in [NEEDS CLARIFICATION: how?]\nPhotos are kept.\nUp to [NEEDS CLARIFICATION: size] each.';

    expect(clarificationMarkersIn('specs/002-sharing/spec.md', text)).toEqual([
      { path: 'specs/002-sharing/spec.md', line: 1 },
      { path: 'specs/002-sharing/spec.md', line: 3 },
    ]);
  });

  it('takes the current feature from the current-feature file', () => {
    const current = currentFeatureOf(FEATURES, {
      featureFileText: '{"feature_directory": "specs/002-sharing"}',
      gitHeadText: 'ref: refs/heads/001-photo-albums\n',
    });

    expect(current).toBe('002-sharing');
  });

  it('falls back to the branch named after a feature', () => {
    expect(currentFeatureOf(FEATURES, { gitHeadText: 'ref: refs/heads/001-photo-albums\n' })).toBe(
      '001-photo-albums',
    );
    expect(currentFeatureOf(FEATURES, { gitHeadText: 'ref: refs/heads/main\n' })).toBeUndefined();
    expect(
      currentFeatureOf(FEATURES, { featureFileText: 'not json', gitHeadText: '4f2c1d0\n' }),
    ).toBeUndefined();
  });
});
