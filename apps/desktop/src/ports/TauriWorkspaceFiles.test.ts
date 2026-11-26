import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, describe, expect, it } from 'vitest';
import { TauriWorkspaceFiles } from './TauriWorkspaceFiles';

afterEach(() => clearMocks());

function recordCommands(replies: Record<string, unknown>) {
  const calls: { command: string; args: unknown }[] = [];
  mockIPC((command, args) => {
    calls.push({ command, args });
    return replies[command] ?? null;
  });
  return calls;
}

describe('TauriWorkspaceFiles', () => {
  it('chooses the export place, then writes to it without naming a path', async () => {
    const calls = recordCommands({
      pick_workspace_export_place: { folder: 'D:\\team' },
      write_workspace_export: 'D:\\team\\Handbook.mdxworkspace',
    });
    const files = new TauriWorkspaceFiles();

    const place = await files.chooseExportPlace('Handbook.mdxworkspace');
    const savedPath = await files.writeExport('{}');

    expect(place).toEqual({ folder: 'D:\\team' });
    expect(savedPath).toBe('D:\\team\\Handbook.mdxworkspace');
    expect(calls).toEqual([
      { command: 'pick_workspace_export_place', args: { suggestedFileName: 'Handbook.mdxworkspace' } },
      { command: 'write_workspace_export', args: { contents: '{}' } },
    ]);
  });

  it('turns a cancelled dialog into undefined', async () => {
    recordCommands({});
    const files = new TauriWorkspaceFiles();

    expect(await files.chooseExportPlace('Handbook.mdxworkspace')).toBeUndefined();
    expect(await files.openWorkspaceFile()).toBeUndefined();
    expect(await files.takeStartupWorkspaceFile()).toBeUndefined();
  });

  it('passes an opened file through as read', async () => {
    const contents = { path: 'D:\\team\\h.mdxworkspace', folder: 'D:\\team', text: '{}' };
    recordCommands({ open_workspace_file: contents });

    expect(await new TauriWorkspaceFiles().openWorkspaceFile()).toEqual(contents);
  });
});
