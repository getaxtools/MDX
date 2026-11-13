import { WorkspaceKindsState, type WorkspaceKind } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import { effectiveCommandShortcuts } from '../shortcuts/effectiveCommandShortcuts';
import { paletteCommands } from './paletteCommands';

const NOTES_BUILT_SPEC_VIEWER_PLANNED: readonly WorkspaceKind[] = [
  { id: 'markdownViewer', availability: 'built' },
  { id: 'notes', availability: 'built' },
  { id: 'specViewer', availability: 'planned' },
];

function kindSwitchesIn(enabledKindIds: string[], activeKindId: string): string[] {
  const workspaceKinds = WorkspaceKindsState.fromSaved(
    { enabledKindIds, activeKindId },
    NOTES_BUILT_SPEC_VIEWER_PLANNED,
  );
  return paletteCommands(createTranslator(), { shortcuts: effectiveCommandShortcuts({}), workspaceKinds })
    .filter(({ command }) => command.kind === 'switchWorkspaceKind')
    .map(({ label }) => label);
}

const commands = paletteCommands(createTranslator());
const labels = commands.map((command) => command.label);

describe('paletteCommands', () => {
  it('lists commands with their menu labels and shortcuts', () => {
    expect(commands).toContainEqual({
      command: { kind: 'openDocuments' },
      label: 'Open…',
      shortcut: 'Ctrl+O',
    });
  });

  it('includes commands that have no shortcut', () => {
    expect(commands).toContainEqual({ command: { kind: 'openFolder' }, label: 'Open Folder…' });
  });

  it('names theme, reading width and typography choices after their menu', () => {
    expect(labels).toContain('Theme: Dark');
    expect(labels).toContain('Reading Width: Full Width');
    expect(labels).toContain('Typography: Academic');
  });

  it('offers Settings, Copy as HTML and Clear All Data', () => {
    expect(labels).toEqual(expect.arrayContaining(['Settings…', 'Copy as HTML', 'Clear All Data…']));
  });

  it('leaves out the command palette itself', () => {
    expect(commands.some(({ command }) => command.kind === 'showCommandPalette')).toBe(false);
  });

  it('lists each command once', () => {
    const commandKeys = commands.map(({ command }) => JSON.stringify(command));

    expect(new Set(commandKeys).size).toBe(commandKeys.length);
  });

  it('offers Show Control Wheel with the effective shortcut', () => {
    const changed = paletteCommands(createTranslator(), {
      shortcuts: effectiveCommandShortcuts({ toggleControlWheel: ['ctrl', 'shift', 'J'] }),
      workspaceKinds: WorkspaceKindsState.initial(NOTES_BUILT_SPEC_VIEWER_PLANNED),
    });

    expect(commands).toContainEqual({
      command: { kind: 'toggleControlWheel' },
      label: 'Show Control Wheel',
      shortcut: 'Ctrl+Shift+Space',
    });
    expect(changed).toContainEqual({
      command: { kind: 'toggleControlWheel' },
      label: 'Show Control Wheel',
      shortcut: 'Ctrl+Shift+J',
    });
  });

  it('offers Choose Workspace Kinds', () => {
    expect(commands).toContainEqual({
      command: { kind: 'showWorkspaceKindSettings' },
      label: 'Choose Workspace Kinds…',
    });
  });

  it('offers a switch for each enabled kind except the active one', () => {
    expect(kindSwitchesIn(['markdownViewer', 'notes'], 'markdownViewer')).toEqual(['Workspace Kind: Notes']);
    expect(kindSwitchesIn(['markdownViewer', 'notes'], 'notes')).toEqual(['Workspace Kind: Markdown viewer']);
  });

  it('never offers a planned or disabled kind', () => {
    expect(kindSwitchesIn(['markdownViewer', 'specViewer'], 'markdownViewer')).toEqual([]);
    expect(kindSwitchesIn(['markdownViewer'], 'markdownViewer')).toEqual([]);
  });
});
