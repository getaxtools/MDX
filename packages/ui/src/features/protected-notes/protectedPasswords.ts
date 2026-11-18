export const MIN_PROTECTED_PASSWORD_LENGTH = 10;

export type PasswordProblem = 'tooShort' | 'mismatch';

const GROUP_SEPARATOR = '-';
const CONFIRMED_GROUPS = 2;
/** Crockford base32 reads these letters as the digits they look like. */
const LOOK_ALIKES: Readonly<Record<string, string>> = { O: '0', I: '1', L: '1' };

/** Counts characters as the native side does, so an emoji is one character, not two. */
export function characterCount(text: string): number {
  return Array.from(text).length;
}

/** Why a new password, typed twice, cannot be used; undefined when it can. */
export function passwordProblemOf(password: string, repeated: string): PasswordProblem | undefined {
  if (characterCount(password) < MIN_PROTECTED_PASSWORD_LENGTH) return 'tooShort';
  return password === repeated ? undefined : 'mismatch';
}

/**
 * The end of a recovery key the user types back before set-up finishes. Its last group is a two
 * character check, so the group before it is asked for too.
 */
export function confirmationPartOf(recoveryKey: string): string {
  return recoveryKey.split(GROUP_SEPARATOR).slice(-CONFIRMED_GROUPS).join(GROUP_SEPARATOR);
}

export function isRecoveryKeyConfirmed(recoveryKey: string, typed: string): boolean {
  const expected = normalizedKeyText(confirmationPartOf(recoveryKey));
  return expected !== '' && normalizedKeyText(typed) === expected;
}

function normalizedKeyText(text: string): string {
  return Array.from(text.toUpperCase())
    .filter((character) => character !== GROUP_SEPARATOR && character.trim() !== '')
    .map((character) => LOOK_ALIKES[character] ?? character)
    .join('');
}
