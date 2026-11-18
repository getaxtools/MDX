import { describe, expect, it } from 'vitest';
import { ProtectedNotesError, type ProtectedNotesPort } from '../ProtectedNotesPort';
import { InMemoryProtectedNotes } from './InMemoryProtectedNotes';

const LOCATION = 'C:\\Users\\Ana\\Documents\\MDX Notes';
const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'staple tuna lighthouse';

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
      isReencrypting: false,
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

  it('changes the password after the current one is confirmed, after which the old one fails', async () => {
    const notes = create();
    await notes.setUp(LOCATION, PASSWORD);
    const change = { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, shouldReencrypt: false };

    const refused = await failureOf(
      notes.changePassword(LOCATION, { ...change, currentPassword: 'not the password' }),
    );
    const changed = await notes.changePassword(LOCATION, change);
    await notes.lock(LOCATION);

    expect(refused).toBe('wrongPassword');
    expect(changed).toEqual({});
    expect(await failureOf(notes.unlock(LOCATION, PASSWORD, false))).toBe('wrongPassword');
    await notes.unlock(LOCATION, NEW_PASSWORD, false);
  });

  it('re-encrypts with a new recovery key, carried on until nothing remains, also after a lock', async () => {
    const notes = create();
    const { recoveryKey: oldRecoveryKey } = await notes.setUp(LOCATION, PASSWORD);
    for (let index = 0; index < 20; index += 1)
      await notes.create(LOCATION, { title: `Note ${String(index)}`, folder: '' });

    const { recoveryKey } = await notes.changePassword(LOCATION, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      shouldReencrypt: true,
    });
    const first = await notes.continueReencryption(LOCATION);
    await notes.lock(LOCATION);
    const isReencryptingWhileLocked = (await notes.status(LOCATION)).isReencrypting;
    await notes.unlock(LOCATION, NEW_PASSWORD, false);
    const plainChangeMeanwhile = await failureOf(
      notes.changePassword(LOCATION, {
        currentPassword: NEW_PASSWORD,
        newPassword: PASSWORD,
        shouldReencrypt: false,
      }),
    );
    let progress = await notes.continueReencryption(LOCATION);
    while (progress.remaining > 0) progress = await notes.continueReencryption(LOCATION);

    expect(recoveryKey).toBeDefined();
    expect(recoveryKey).not.toBe(oldRecoveryKey);
    expect(first.remaining).toBeGreaterThan(0);
    expect(isReencryptingWhileLocked).toBe(true);
    expect(plainChangeMeanwhile).toBe('reencryptionPending');
    expect(progress).toEqual({ remaining: 0, damaged: 0, heldBack: 0, isUnverifiable: false });
    expect(await failureOf(notes.finishReencryption(LOCATION, 'not the password', {}))).toBe('wrongPassword');
    await notes.finishReencryption(LOCATION, NEW_PASSWORD, {});
    expect((await notes.status(LOCATION)).isReencrypting).toBe(false);
  });

  it('a new recovery key needs the password and replaces the old one', async () => {
    const notes = create();
    const { recoveryKey: oldRecoveryKey } = await notes.setUp(LOCATION, PASSWORD);

    const refused = await failureOf(notes.newRecoveryKey(LOCATION, 'not the password'));
    const { recoveryKey } = await notes.newRecoveryKey(LOCATION, PASSWORD);
    await notes.lock(LOCATION);

    expect(refused).toBe('wrongPassword');
    expect(
      await failureOf(
        notes.unlockWithRecoveryKey(LOCATION, { recoveryKey: oldRecoveryKey, newPassword: NEW_PASSWORD }),
      ),
    ).toBe('wrongPassword');
    await notes.unlockWithRecoveryKey(LOCATION, { recoveryKey, newPassword: NEW_PASSWORD });
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

  it('tells every subscriber which sections locked, once each', async () => {
    const notes = create();
    await notes.setUp(LOCATION, PASSWORD);
    const first: (readonly string[])[] = [];
    const second: (readonly string[])[] = [];
    notes.onLocked((keys) => first.push(keys));
    const stop = notes.onLocked((keys) => second.push(keys));

    await notes.lock(LOCATION);
    await notes.lock(LOCATION);
    stop();
    await notes.unlock(LOCATION, PASSWORD, false);
    await notes.lockAll();

    expect(first).toEqual([[LOCATION], [LOCATION]]);
    expect(second).toEqual([[LOCATION]]);
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

  const PLAIN_NOTE = `${LOCATION}\\Bank details.md`;

  async function withPlainNote(): Promise<InMemoryProtectedNotes> {
    const notes = new InMemoryProtectedNotes();
    notes.plainNotes.set(PLAIN_NOTE, 'PIN 4821\r\n');
    await notes.setUp(LOCATION, PASSWORD);
    return notes;
  }

  it('moves a plain note in, after which it is protected and the plain note is gone', async () => {
    const notes = await withPlainNote();

    const moved = await notes.moveIn(LOCATION, { notePath: PLAIN_NOTE, intoFolder: '', isConfirmed: true });

    expect(moved.isPlainCopyKept).toBe(false);
    expect((await notes.open(LOCATION, moved.noteId)).text).toBe('PIN 4821\r\n');
    expect((await notes.list(LOCATION)).map((note) => note.title)).toEqual(['Bank details']);
    expect(notes.plainNotes.has(PLAIN_NOTE)).toBe(false);
  });

  it('moves a note out under a free name, after which it is no longer protected', async () => {
    const notes = await withPlainNote();
    const { noteId } = await notes.moveIn(LOCATION, {
      notePath: PLAIN_NOTE,
      intoFolder: '',
      isConfirmed: true,
    });
    notes.plainNotes.set(PLAIN_NOTE, 'a new note took the name');

    const written = await notes.moveOut(LOCATION, { noteId, intoFolder: LOCATION, isConfirmed: true });

    expect(written.fileName).toBe('Bank details 2.md');
    expect(notes.plainNotes.get(written.displayPath)).toBe('PIN 4821\r\n');
    expect(await notes.list(LOCATION)).toEqual([]);
  });

  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

  it('seals pasted and dropped pictures in the Attachments folder under free names', async () => {
    const notes = await withPlainNote();
    notes.droppedPictures.set('C:\\Pictures\\Chart.png', PNG);

    const pasted = await notes.addPastedAttachment(LOCATION, { name: 'Chart.png', bytes: PNG });
    const dropped = await notes.addDroppedAttachment(LOCATION, 'C:\\Pictures\\Chart.png');

    expect([pasted.fileName, dropped.fileName]).toEqual(['Chart.png', 'Chart-2.png']);
    expect(await notes.openAttachment(LOCATION, pasted.noteId)).toEqual(PNG);
    expect((await notes.list(LOCATION)).map((note) => [note.kind, note.folder])).toEqual([
      ['attachment', 'Attachments'],
      ['attachment', 'Attachments'],
    ]);
  });

  it('refuses what is not a picture, a drop it did not see and a note as a picture', async () => {
    const notes = await withPlainNote();
    const noteId = await notes.create(LOCATION, { title: 'Bank details', folder: '' });

    expect(
      await failureOf(notes.addPastedAttachment(LOCATION, { name: 'a.txt', bytes: new Uint8Array([65]) })),
    ).toBe('invalidRequest');
    expect(await failureOf(notes.addDroppedAttachment(LOCATION, 'C:\\elsewhere.png'))).toBe('accessDenied');
    expect(await failureOf(notes.openAttachment(LOCATION, noteId))).toBe('notFound');
  });

  it('refuses moves the user did not confirm and plain notes outside the location', async () => {
    const notes = await withPlainNote();
    const noteId = await notes.create(LOCATION, { title: 'Kept', folder: '' });

    expect(
      await failureOf(notes.moveIn(LOCATION, { notePath: PLAIN_NOTE, intoFolder: '', isConfirmed: false })),
    ).toBe('invalidRequest');
    expect(
      await failureOf(
        notes.moveIn(LOCATION, { notePath: 'D:\\Elsewhere\\note.md', intoFolder: '', isConfirmed: true }),
      ),
    ).toBe('accessDenied');
    expect(
      await failureOf(notes.moveOut(LOCATION, { noteId, intoFolder: LOCATION, isConfirmed: false })),
    ).toBe('invalidRequest');
    expect(notes.plainNotes.has(PLAIN_NOTE)).toBe(true);
    expect((await notes.list(LOCATION)).map((note) => note.title)).toEqual(['Kept']);
  });
});
