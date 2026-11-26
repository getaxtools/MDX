import { describe, expect, it } from 'vitest';
import {
  highestSeverityOf,
  isAtLeast,
  isInjectionSeverity,
  SEVERITIES_FROM_HIGHEST,
  shiftSeverity,
} from './injectionSeverity';

describe('injection severity', () => {
  it('orders severities from High to Info', () => {
    expect(SEVERITIES_FROM_HIGHEST).toEqual(['high', 'medium', 'low', 'info']);
  });

  it('shifts within High and Info', () => {
    expect(shiftSeverity('low', 1)).toBe('medium');
    expect(shiftSeverity('medium', -2)).toBe('info');
    expect(shiftSeverity('high', 3)).toBe('high');
    expect(shiftSeverity('info', -1)).toBe('info');
  });

  it('compares severities', () => {
    expect(isAtLeast('high', 'medium')).toBe(true);
    expect(isAtLeast('low', 'medium')).toBe(false);
    expect(isAtLeast('medium', 'medium')).toBe(true);
  });

  it('finds the highest severity, or none in an empty list', () => {
    expect(highestSeverityOf(['low', 'high', 'info'])).toBe('high');
    expect(highestSeverityOf([])).toBeUndefined();
  });

  it('recognises only the four severity names', () => {
    expect(isInjectionSeverity('medium')).toBe(true);
    expect(isInjectionSeverity('critical')).toBe(false);
    expect(isInjectionSeverity(2)).toBe(false);
  });
});
