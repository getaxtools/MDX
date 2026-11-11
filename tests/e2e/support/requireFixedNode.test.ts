import { describe, expect, it } from 'vitest';
import { hasKnownSocketCrash } from './requireFixedNode';

describe('hasKnownSocketCrash', () => {
  it.each(['24.0.0', '24.15.0'])('flags Node %s on Windows', (nodeVersion) => {
    expect(hasKnownSocketCrash('win32', nodeVersion)).toBe(true);
  });

  it.each(['24.16.0', '24.22.1', '26.0.0'])('accepts Node %s on Windows', (nodeVersion) => {
    expect(hasKnownSocketCrash('win32', nodeVersion)).toBe(false);
  });

  it('accepts every Node version on other platforms', () => {
    expect(hasKnownSocketCrash('linux', '24.15.0')).toBe(false);
  });
});
