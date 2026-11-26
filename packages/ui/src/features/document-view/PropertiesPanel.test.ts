import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ViewerCommand } from '../viewer/viewerCommands';
import PropertiesPanel from './PropertiesPanel.svelte';
import type { PropertiesEditability, PropertyFieldsState } from './PropertyEditing';

const SIMPLE: PropertiesEditability = {
  kind: 'fields',
  properties: [
    { key: 'status', kind: 'value', value: 'draft' },
    { key: 'tags', kind: 'list', values: ['work', 'q4'] },
    { key: 'aliases', kind: 'list', values: ['Plan, 2026'] },
  ],
};
const SIMPLE_FRONT_MATTER = 'status: draft\ntags: [work, q4]\naliases:\n  - "Plan, 2026"';

function renderPanel(
  options: { editability?: PropertiesEditability; fieldsState?: PropertyFieldsState } = {},
) {
  const commands: ViewerCommand[] = [];
  render(PropertiesPanel, {
    frontMatter: SIMPLE_FRONT_MATTER,
    canonicalKey: 'e:\\journal\\plan.md',
    translator: createTranslator(),
    onCommand: (command: ViewerCommand) => commands.push(command),
    ...options,
  });
  return commands;
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('Properties'));
}

describe('PropertiesPanel', () => {
  it('lists front matter properties under a collapsed Properties heading', () => {
    render(PropertiesPanel, {
      frontMatter: 'title: Release notes\ntags: [guide, release]',
      translator: createTranslator(),
    });

    const panel = screen.getByRole('group');

    expect(screen.getByText('Properties')).toBeTruthy();
    expect(panel.hasAttribute('open')).toBe(false);
    expect(screen.getAllByRole('term').map((name) => name.textContent)).toEqual(['title', 'tags']);
    expect(screen.getAllByRole('definition').map((value) => value.textContent)).toEqual([
      'Release notes',
      'guide, release',
    ]);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shows complex front matter as text', () => {
    render(PropertiesPanel, { frontMatter: 'author:\n  name: Ada', translator: createTranslator() });

    expect(screen.getByText(/name: Ada/)).toBeTruthy();
    expect(screen.queryByRole('term')).toBeNull();
  });

  it('fields for simple front matter', async () => {
    const user = userEvent.setup();
    renderPanel({ editability: SIMPLE });
    await openPanel(user);

    const status = screen.getByRole('textbox', { name: 'status' });
    const tags = screen.getByRole('textbox', { name: 'tags' });

    expect((status as HTMLInputElement).value).toBe('draft');
    expect((tags as HTMLInputElement).value).toBe('work, q4');
    expect(status.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('Press Enter to save a change, or Escape to undo it.')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'aliases' })).toBeNull();
    expect(screen.getByText('Plan, 2026')).toBeTruthy();
  });

  it('Enter saves the typed value of the field', async () => {
    const user = userEvent.setup();
    const commands = renderPanel({ editability: SIMPLE });
    await openPanel(user);

    await user.tab();
    await user.keyboard('{Control>}a{/Control}done{Enter}');

    expect(commands).toEqual([
      {
        kind: 'editProperty',
        canonicalKey: 'e:\\journal\\plan.md',
        edit: { kind: 'setValue', key: 'status', value: 'done' },
      },
    ]);
  });

  it('a list field saves its items', async () => {
    const user = userEvent.setup();
    const commands = renderPanel({ editability: SIMPLE });
    await openPanel(user);

    await user.clear(screen.getByRole('textbox', { name: 'tags' }));
    await user.keyboard('work, q1{Enter}');

    expect(commands).toEqual([
      {
        kind: 'editProperty',
        canonicalKey: 'e:\\journal\\plan.md',
        edit: { kind: 'setList', key: 'tags', values: ['work', 'q1'] },
      },
    ]);
  });

  it('Escape puts the saved value back without saving', async () => {
    const user = userEvent.setup();
    const commands = renderPanel({ editability: SIMPLE });
    await openPanel(user);
    const status = screen.getByRole('textbox', { name: 'status' });

    await user.clear(status);
    await user.keyboard('done{Escape}');

    expect((status as HTMLInputElement).value).toBe('draft');
    expect(commands).toEqual([]);
  });

  it('leaving a field without Enter keeps the file unchanged', async () => {
    const user = userEvent.setup();
    const commands = renderPanel({ editability: SIMPLE });
    await openPanel(user);
    const status = screen.getByRole('textbox', { name: 'status' });

    await user.clear(status);
    await user.keyboard('done');
    await user.tab();

    expect((status as HTMLInputElement).value).toBe('draft');
    expect(commands).toEqual([]);
  });

  it('fields take no changes while the note has unsaved changes, stay focusable and say why', async () => {
    const user = userEvent.setup();
    const commands = renderPanel({ editability: SIMPLE, fieldsState: 'unsavedChanges' });
    await openPanel(user);
    const status = screen.getByRole('textbox', { name: 'status' });

    await user.tab();
    await user.keyboard('done{Enter}');

    expect(document.activeElement).toBe(status);
    expect((status as HTMLInputElement).readOnly).toBe(true);
    expect(status.getAttribute('aria-disabled')).toBe('true');
    expect((status as HTMLInputElement).value).toBe('draft');
    expect(screen.getByText('Save the note to change its properties here.').id).toBe(
      status.getAttribute('aria-describedby'),
    );
    expect(commands).toEqual([]);
  });

  it('while a property is being written the fields wait without asking for a save', async () => {
    const user = userEvent.setup();
    renderPanel({ editability: SIMPLE, fieldsState: 'saving' });
    await openPanel(user);

    const status = screen.getByRole('textbox', { name: 'status' });

    expect(status.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Press Enter to save a change, or Escape to undo it.')).toBeTruthy();
    expect(screen.queryByText('Save the note to change its properties here.')).toBeNull();
  });

  it('a list with a comma in an item says why it is not a field and offers Edit in Note', async () => {
    const user = userEvent.setup();
    const commands = renderPanel({ editability: SIMPLE });
    await openPanel(user);

    await user.click(screen.getByRole('button', { name: 'Edit in Note' }));

    expect(screen.getByText('An item holds a comma, so change this list in the note.')).toBeTruthy();
    expect(commands).toEqual([{ kind: 'editPropertiesInNote' }]);
  });

  it('read-only with Edit in note for complex', async () => {
    const user = userEvent.setup();
    const commands: ViewerCommand[] = [];
    render(PropertiesPanel, {
      frontMatter: 'owner:\n  name: Ada',
      editability: { kind: 'inNote' },
      translator: createTranslator(),
      onCommand: (command: ViewerCommand) => commands.push(command),
    });
    await openPanel(user);

    await user.tab();
    await user.keyboard('{Enter}');

    expect(screen.getByText(/name: Ada/)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit in Note' })).toBe(document.activeElement);
    expect(commands).toEqual([{ kind: 'editPropertiesInNote' }]);
  });
});
