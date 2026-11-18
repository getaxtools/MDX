import { describe, expect, it } from 'vitest';
import { ProtectedNotesError, type ProtectedNotesPort } from '../ProtectedNotesPort';
import { InMemoryProtectedNotes } from './InMemoryProtectedNotes';

const LOCATION = 'C:\\Users\\Ana\\Documents\\MDX Notes';
const PASSWORD = 'correct horse battery';

async function failureOf(work: Promise<unknown>): Promise<string | undefined> {
  try {
    await work;
    return undefined;
  } catch (error) {
    return error instanceof ProtectedNotesError ? error.failure : 'other';
  }
}

/** What every implementation of the port must do, run here against the fake. */
function describeProtectedNotesContract(create: () => ProtectedNotesPort) {
  it('sets up an unlocked section that keeps its notes and their text', async () => {
    const notes = create();

    const { recoveryKey } = await notes.setUp(LOCATION, PASSWORD);
    const noteId = await notes.create(LOCATION, { title: 'Bank details', folder: '' });
    await notes.save(LOCATION, { noteId, text: 'PIN 4821\r\n', encoding: 'utf-8', hasByteOrderMark: false });

    expect(recoveryKey).not.toBe('');
    expect(await notes.status(LOCATION)).toEqual({
      isSetUp: true,
      isUnlocked: true,
      canUnlockOnThisPc: false,
    });
    expect((await notes.open(LOCATION, noteId)).text).toBe('PIN 4821\r\n');
    expect((await notes.list(LOCATION)).map((note) => note.title)).toEqual(['Bank details']);
  });

  it('refuses a short password, a wrong password and work while locked', async () => {
    const notes = create();

    expect(await failureOf(notes.setUp(LOCATION, 'too short'))).toBe('passwordTooShort');
    await notes.setUp(LOCATION, PASSWORD);
    await notes.lock(LOCATION);

    expect(await failureOf(notes.list(LOCATION))).toBe('locked');
    expect(await failureOf(notes.unlock(LOCATION, 'wrong password', false))).toBe('wrongPassword');
    await notes.unlock(LOCATION, PASSWORD, false);
    expect((await notes.status(LOCATION)).isUnlocked).toBe(true);
  });

  it('unlocks with the recovery key and a new password, after which the old one fails', async () => {
    const notes = create();
    const { recoveryKey } = await notes.setUp(LOCATION, PASSWORD);
    await notes.lock(LOCATION);

    await notes.unlockWithRecoveryKey(LOCATION, { recoveryKey, newPassword: 'another long passphrase' });
    await notes.lock(LOCATION);

    expect(await failureOf(notes.unlock(LOCATION, PASSWORD, false))).toBe('wrongPassword');
    await notes.unlock(LOCATION, 'another long passphrase', false);
  });

  it('remembers this PC until it is forgotten', async () => {
    const notes = create();
    await notes.setUp(LOCATION, PASSWORD);
    await notes.lock(LOCATION);
    expect(await failureOf(notes.unlockOnThisPc(LOCATION))).toBe('notRemembered');

    await notes.unlock(LOCATION, PASSWORD, true);
    await notes.lockAll();
    await notes.unlockOnThisPc(LOCATION);
    await notes.forgetThisPc(LOCATION);
    await notes.lock(LOCATION);

    expect(await failureOf(notes.unlockOnThisPc(LOCATION))).toBe('notRemembered');
  });

  it('refuses ids that are not note ids', async () => {
    const notes = create();
    await notes.setUp(LOCATION, PASSWORD);

    expect(await failureOf(notes.open(LOCATION, '../vault'))).toBe('invalidRequest');
    expect(await failureOf(notes.open(LOCATION, '0'.repeat(32)))).toBe('notFound');
  });
}

describe('InMemoryProtectedNotes', () => {
  describeProtectedNotesContract(() => new InMemoryProtectedNotes());
});
