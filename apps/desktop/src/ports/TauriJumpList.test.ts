import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, describe, expect, it } from 'vitest';
import { TauriJumpList } from './TauriJumpList';

afterEach(() => clearMocks());

describe('TauriJumpList', () => {
  it('sends the category and each workspace id and name to the Jump List command', async () => {
    const calls: { command: string; args: unknown }[] = [];
    mockIPC((command, args) => {
      calls.push({ command, args });
      return { outcome: 'refusedByPrivacySetting', removedWorkspaceIds: ['old-1'] };
    });
    const workspaces = [{ id: 'reading-1', name: 'Reading' }];

    const answer = await new TauriJumpList().showRecentWorkspaces('Workspaces', workspaces);

    expect(answer).toEqual({ outcome: 'refusedByPrivacySetting', removedWorkspaceIds: ['old-1'] });
    expect(calls).toEqual([
      { command: 'show_jump_list_workspaces', args: { category: 'Workspaces', workspaces } },
    ]);
  });
});
