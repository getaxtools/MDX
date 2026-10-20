import { createTranslator } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import { paletteCommands } from './paletteCommands';

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

  it('names theme and reading width choices after their menu', () => {
    expect(labels).toContain('Theme: Dark');
    expect(labels).toContain('Reading Width: Full Width');
  });

  it('leaves out the command palette itself', () => {
    expect(commands.some(({ command }) => command.kind === 'showCommandPalette')).toBe(false);
  });

  it('lists each command once', () => {
    const commandKeys = commands.map(({ command }) => JSON.stringify(command));

    expect(new Set(commandKeys).size).toBe(commandKeys.length);
  });
});
