import { describe, expect, it } from 'vitest';
import { readChangeMetadata } from './readChangeMetadata';

describe('readChangeMetadata', () => {
  it('reads valid metadata', () => {
    const metadata = readChangeMetadata('schema: spec-driven\ncreated: 2026-11-12\nskip_specs: true\n');

    expect(metadata).toEqual({
      schema: 'spec-driven',
      created: '2026-11-12',
      isSkippingSpecs: true,
      mentionsSkipSpecs: true,
      unknownKeys: [],
      problems: [],
    });
  });

  it('reports a creation date that is not a real day', () => {
    const metadata = readChangeMetadata('schema: spec-driven\ncreated: 2026-13-45\n');

    expect(metadata.created).toBeUndefined();
    expect(metadata.problems).toEqual(['invalidCreatedDate']);
  });

  it('does not honour skip_specs when the date is not in YYYY-MM-DD form', () => {
    const metadata = readChangeMetadata('schema: spec-driven\ncreated: Nov 12\nskip_specs: true\n');

    expect(metadata.isSkippingSpecs).toBe(false);
    expect(metadata.mentionsSkipSpecs).toBe(true);
  });

  it('lists unknown keys but not extension keys', () => {
    const metadata = readChangeMetadata('schema: spec-driven\nowner: someone\nx-tracker: T-1\nX-Bad: 1\n');

    expect(metadata.unknownKeys).toEqual(['X-Bad', 'owner']);
  });

  it('reports a skip_specs value that is not a boolean', () => {
    const metadata = readChangeMetadata('schema: spec-driven\nskip_specs: yes\n');

    expect(metadata.problems).toEqual(['invalidSkipSpecs']);
    expect(metadata.isSkippingSpecs).toBe(false);
    expect(metadata.mentionsSkipSpecs).toBe(true);
  });

  it('does not honour skip_specs without a schema', () => {
    const metadata = readChangeMetadata('skip_specs: true\n');

    expect(metadata.problems).toEqual(['missingSchema']);
    expect(metadata.isSkippingSpecs).toBe(false);
  });

  it('reads a change without a metadata file as having none', () => {
    expect(readChangeMetadata(undefined)).toEqual({
      isSkippingSpecs: false,
      mentionsSkipSpecs: false,
      unknownKeys: [],
      problems: [],
    });
  });
});
