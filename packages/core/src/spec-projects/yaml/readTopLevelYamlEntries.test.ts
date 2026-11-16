import { describe, expect, it } from 'vitest';
import { readTopLevelYamlEntries, topLevelYamlValue } from './readTopLevelYamlEntries';

describe('readTopLevelYamlEntries', () => {
  it('reads keys at the first column with their values and lines', () => {
    const text = '﻿schema: spec-driven\r\ncreated: "2026-11-12"\r\nskip_specs: true # no deltas\r\n';

    expect(readTopLevelYamlEntries(text)).toEqual([
      { key: 'schema', value: 'spec-driven', lineNumber: 1 },
      { key: 'created', value: '2026-11-12', lineNumber: 2 },
      { key: 'skip_specs', value: 'true', lineNumber: 3 },
    ]);
  });

  it('skips nested keys, list items and block text', () => {
    const text = [
      'context: |',
      '  store: not-a-key',
      '  - item',
      'rules:',
      '  proposal:',
      '    - Be short',
      'store: team-plans',
    ].join('\n');

    expect(readTopLevelYamlEntries(text).map((entry) => `${entry.key}=${entry.value}`)).toEqual([
      'context=|',
      'rules=',
      'store=team-plans',
    ]);
  });

  it('finds one value by its key', () => {
    expect(topLevelYamlValue("store: 'team-plans'", 'store')).toBe('team-plans');
    expect(topLevelYamlValue('schema: spec-driven', 'store')).toBeUndefined();
  });

  it('keeps a hash inside a quoted value', () => {
    expect(topLevelYamlValue('goal: "Ship #1"', 'goal')).toBe('Ship #1');
  });
});
