import { describe, expect, it } from 'vitest';
import {
  characterCount,
  confirmationPartOf,
  isRecoveryKeyConfirmed,
  passwordProblemOf,
} from './protectedPasswords';

const RECOVERY_KEY = 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789-ABCD-EFGH-JKMN-PQRS-TV1Z-7Q';

describe('new protected passwords', () => {
  it('needs at least 10 characters', () => {
    expect(passwordProblemOf('123456789', '123456789')).toBe('tooShort');
    expect(passwordProblemOf('1234567890', '1234567890')).toBeUndefined();
  });

  it('counts an emoji as one character', () => {
    expect(characterCount('🔐🔐🔐')).toBe(3);
    expect(passwordProblemOf('🔐🔐🔐🔐🔐🔐🔐🔐🔐', '🔐🔐🔐🔐🔐🔐🔐🔐🔐')).toBe('tooShort');
  });

  it('must be typed the same twice', () => {
    expect(passwordProblemOf('correct horse', 'correct horsE')).toBe('mismatch');
  });
});

describe('confirming the recovery key', () => {
  it('asks for the last two groups, as the last one is a short check', () => {
    expect(confirmationPartOf(RECOVERY_KEY)).toBe('TV1Z-7Q');
  });

  it('accepts the end typed in lower case, without the dash or with look-alike letters', () => {
    expect(isRecoveryKeyConfirmed(RECOVERY_KEY, 'tv1z-7q')).toBe(true);
    expect(isRecoveryKeyConfirmed(RECOVERY_KEY, ' TV1Z 7Q ')).toBe(true);
    expect(isRecoveryKeyConfirmed(RECOVERY_KEY, 'TVIZ7Q')).toBe(true);
  });

  it('refuses any other end, or nothing', () => {
    expect(isRecoveryKeyConfirmed(RECOVERY_KEY, 'TV1Z-7R')).toBe(false);
    expect(isRecoveryKeyConfirmed(RECOVERY_KEY, '7Q')).toBe(false);
    expect(isRecoveryKeyConfirmed(RECOVERY_KEY, '')).toBe(false);
  });
});
