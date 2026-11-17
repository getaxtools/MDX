import { describe, expect, it, vi } from 'vitest';
import { InMemoryProtectedShell } from './InMemoryProtectedShell';

describe('InMemoryProtectedShell', () => {
  it('copies text kept out of clipboard history', async () => {
    const shell = new InMemoryProtectedShell();

    await shell.copyOutsideHistory('salary 4200');

    expect(shell.clipboard).toEqual({ text: 'salary 4200', isKeptOutOfHistory: true });
  });

  it('clears the clipboard only while it still holds our copy', async () => {
    const shell = new InMemoryProtectedShell();
    await shell.copyOutsideHistory('secret');

    const isCleared = await shell.clearOwnCopy();
    await shell.copyOutsideHistory('secret');
    shell.copyElsewhere('secret');
    const isClearedOverOther = await shell.clearOwnCopy();

    expect(isCleared).toBe(true);
    expect(isClearedOverOther).toBe(false);
    expect(shell.clipboard).toEqual({ text: 'secret', isKeptOutOfHistory: false });
  });

  it('a second clear does nothing once our copy is gone', async () => {
    const shell = new InMemoryProtectedShell();
    await shell.copyOutsideHistory('secret');
    await shell.clearOwnCopy();

    expect(await shell.clearOwnCopy()).toBe(false);
  });

  it('reports session and power changes until the listener stops', () => {
    const shell = new InMemoryProtectedShell();
    const listener = vi.fn();
    const stop = shell.onShellEvent(listener);

    shell.emit('sessionLocked');
    stop();
    shell.emit('suspending');

    expect(listener.mock.calls).toEqual([['sessionLocked']]);
  });
});
