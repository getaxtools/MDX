import { WorkspaceKindsState, type RingPoint, type WorkspaceKind } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ControlWheel from './ControlWheel.svelte';

const ALL_KINDS_BUILT: readonly WorkspaceKind[] = [
  { id: 'markdownViewer', availability: 'built' },
  { id: 'notes', availability: 'built' },
  { id: 'specViewer', availability: 'built' },
];

/** jsdom draws nothing, so the wheel is given a 200 pixel box at the top left of the window. */
const WHEEL_BOX = new DOMRect(0, 0, 200, 200);
const WHEEL_CENTRE = 100;

interface WheelOptions {
  readonly pointer?: RingPoint;
}

function renderWheel(
  enabledKindIds = ['markdownViewer', 'notes', 'specViewer'],
  activeKindId = 'markdownViewer',
  { pointer }: WheelOptions = {},
) {
  const onCommand = vi.fn();
  const onClose = vi.fn();
  const onClosed = vi.fn();
  const kinds = WorkspaceKindsState.fromSaved({ enabledKindIds, activeKindId }, ALL_KINDS_BUILT);
  const rendered = render(ControlWheel, {
    kinds,
    dock: 'bottomInlineEnd',
    pointer,
    translator: createTranslator(),
    onCommand,
    onClose,
    onClosed,
  });
  return { ...rendered, onCommand, onClose, onClosed };
}

function stubMatchingMedia(...matchingQueries: string[]) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: matchingQueries.includes(query) }));
}

const segment = (name: string) => screen.getByRole('menuitemradio', { name });
const menu = () => screen.getByRole('menu', { name: 'Workspace kinds' });
const litSegmentNames = () =>
  screen
    .getAllByRole('menuitemradio')
    .filter((item) => item.dataset.lit === 'true')
    .map((item) => item.getAttribute('aria-label'));
const keyCaps = () => within(menu()).queryAllByText(/^[1-9]$/);

function giveTheWheelABox() {
  vi.spyOn(menu(), 'getBoundingClientRect').mockReturnValue(WHEEL_BOX);
}

/** Points at a spot given relative to the centre of the ring, as a mouse would. */
async function pointAt({ x, y }: RingPoint) {
  await fireEvent.pointerMove(menu(), { clientX: WHEEL_CENTRE + x, clientY: WHEEL_CENTRE + y });
}

async function clickAt({ x, y }: RingPoint) {
  await fireEvent.click(menu(), { clientX: WHEEL_CENTRE + x, clientY: WHEEL_CENTRE + y });
}

describe('ControlWheel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    delete document.documentElement.dataset.theme;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows one checkable item per enabled kind, in order, with the active one checked', () => {
    renderWheel(['markdownViewer', 'notes', 'specViewer'], 'notes');

    const items = screen.getAllByRole('menuitemradio');

    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Markdown viewer',
      'Notes',
      'Spec viewer',
    ]);
    expect(items.map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
  });

  it('names the wheel, its menu and its gear for assistive technology', () => {
    renderWheel();

    expect(screen.getByRole('dialog', { name: 'Control wheel' })).toBeTruthy();
    expect(screen.getByRole('menu', { name: 'Workspace kinds' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose workspace kinds' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('focuses the active kind when it opens', () => {
    renderWheel(['markdownViewer', 'notes'], 'notes');

    expect(document.activeElement).toBe(segment('Notes'));
  });

  it('moves the focus round the ring with the arrow keys', async () => {
    const user = userEvent.setup();
    renderWheel();

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(segment('Notes'));
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(document.activeElement).toBe(segment('Spec viewer'));
  });

  it('chooses a kind by its number and closes', async () => {
    const user = userEvent.setup();
    const { onCommand, onClose } = renderWheel();

    await user.keyboard('2');

    expect(onCommand).toHaveBeenCalledWith({ kind: 'switchWorkspaceKind', kindId: 'notes' });
    expect(onClose).toHaveBeenCalled();
  });

  it('chooses the focused kind with Space and stays open', async () => {
    const user = userEvent.setup();
    const { onCommand, onClose } = renderWheel();

    await user.keyboard('{ArrowDown} ');

    expect(onCommand).toHaveBeenCalledWith({ kind: 'switchWorkspaceKind', kindId: 'notes' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('moves between the ring and the gear with Tab', async () => {
    const user = userEvent.setup();
    renderWheel();

    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Choose workspace kinds' }));
    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(segment('Markdown viewer'));
  });

  it('closes with Esc and gives the focus back to what had it before', async () => {
    const user = userEvent.setup();
    const editor = document.createElement('button');
    document.body.append(editor);
    editor.focus();
    const { onClose, unmount } = renderWheel();

    await user.keyboard('{Escape}');
    unmount();

    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(editor);
  });

  it('chooses a kind clicked inside its sector, away from its icon', async () => {
    const { onCommand, onClose } = renderWheel(['markdownViewer', 'notes']);
    giveTheWheelABox();

    await clickAt({ x: 0, y: 95 });

    expect(onCommand).toHaveBeenCalledWith({ kind: 'switchWorkspaceKind', kindId: 'notes' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes without a change when the user presses outside it', async () => {
    const { onCommand, onClose } = renderWheel();

    await fireEvent.pointerDown(document.body);

    expect(onClose).toHaveBeenCalled();
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('gives each segment a tooltip with its name and number', () => {
    renderWheel();

    expect(segment('Spec viewer').getAttribute('title')).toBe('Spec viewer (3)');
    expect(segment('Spec viewer').getAttribute('aria-keyshortcuts')).toBe('3');
  });

  it('opens at the pointer when it was asked to, moved to fit inside the window', () => {
    renderWheel(['markdownViewer'], 'markdownViewer', { pointer: { x: 500, y: 0 } });

    const wheel = screen.getByRole('dialog', { name: 'Control wheel' });

    expect(wheel.style.left).toBe('400px');
    expect(Number.parseFloat(wheel.style.top)).toBeGreaterThan(0);
  });

  it('opens with the kind choices shown and focused when asked to', () => {
    render(ControlWheel, {
      kinds: WorkspaceKindsState.fromSaved({ enabledKindIds: ['markdownViewer'] }, ALL_KINDS_BUILT),
      dock: 'bottomInlineEnd',
      shouldShowKindSettings: true,
      translator: createTranslator(),
      onCommand: vi.fn(),
      onClose: vi.fn(),
    });

    expect(screen.getByRole('dialog', { name: 'Workspace kinds' })).toBeTruthy();
    expect(document.activeElement?.getAttribute('role')).toBe('switch');
  });

  describe('gear', () => {
    it('opens the kind choices and shows that it is expanded', async () => {
      const user = userEvent.setup();
      renderWheel();
      const gear = screen.getByRole('button', { name: 'Choose workspace kinds' });

      await user.click(gear);

      expect(gear.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByRole('dialog', { name: 'Workspace kinds' })).toBeTruthy();
    });

    it('closes the kind choices with Esc and puts the focus back on the gear', async () => {
      const user = userEvent.setup();
      const { onClose } = renderWheel();
      const gear = screen.getByRole('button', { name: 'Choose workspace kinds' });
      await user.click(gear);

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog', { name: 'Workspace kinds' })).toBeNull();
      expect(document.activeElement).toBe(gear);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('surface', () => {
    it('is frosted while transparency effects are on', () => {
      stubMatchingMedia();
      renderWheel();

      expect(screen.getByTestId('wheel-surface').dataset.surface).toBe('frosted');
    });

    it('is opaque when transparency effects are off', () => {
      stubMatchingMedia('(prefers-reduced-transparency: reduce)');
      renderWheel();

      expect(screen.getByTestId('wheel-surface').dataset.surface).toBe('opaque');
    });

    it('is opaque with the high contrast theme', () => {
      stubMatchingMedia();
      document.documentElement.dataset.theme = 'highContrast';
      renderWheel();

      expect(screen.getByTestId('wheel-surface').dataset.surface).toBe('opaque');
    });

    it('gives the gear popup the same surface as the wheel', async () => {
      const user = userEvent.setup();
      stubMatchingMedia('(prefers-reduced-transparency: reduce)');
      renderWheel();

      await user.click(screen.getByRole('button', { name: 'Choose workspace kinds' }));

      expect(screen.getByRole('dialog', { name: 'Workspace kinds' }).dataset.surface).toBe(
        screen.getByTestId('wheel-surface').dataset.surface,
      );
    });
  });

  describe('kind colours', () => {
    it('shows a rim arc in its kind colour on the active segment', () => {
      renderWheel(['markdownViewer', 'notes', 'specViewer'], 'notes');

      const [rim] = screen.getAllByTestId('rim-arc');

      expect(rim?.parentElement?.style.getPropertyValue('--kind-colour')).toBe('var(--color-kind-notes)');
    });

    it('shows a rim arc on the active segment only', () => {
      renderWheel(['markdownViewer', 'notes', 'specViewer'], 'notes');

      expect(screen.getAllByTestId('rim-arc')).toHaveLength(1);
    });

    it('draws each segment in its kind colour', () => {
      renderWheel();

      expect(segment('Spec viewer').style.getPropertyValue('--kind-colour')).toBe(
        'var(--color-kind-spec-viewer)',
      );
    });
  });

  describe('caption', () => {
    it('shows the focused kind and its number', async () => {
      const user = userEvent.setup();
      renderWheel();

      await user.keyboard('{ArrowDown}');

      const caption = screen.getByText('Notes').closest<HTMLElement>('[data-side]');
      expect(caption && within(caption).getByText('2')).toBeTruthy();
    });

    it("shows the pointed kind's name, number and description", async () => {
      renderWheel(['markdownViewer', 'notes']);
      giveTheWheelABox();

      await pointAt({ x: 0, y: 68 });

      const caption = screen.getByText('Write, link and find your notes').closest<HTMLElement>('[data-side]');
      expect(caption && within(caption).getByText('Notes')).toBeTruthy();
      expect(caption && within(caption).getByText('2')).toBeTruthy();
    });

    it('moves above the ring when the wheel is docked low', () => {
      renderWheel();

      expect(screen.getByText('Markdown viewer').closest<HTMLElement>('[data-side]')?.dataset.side).toBe(
        'above',
      );
    });

    it('moves below the ring when the wheel opens near the top of the window', () => {
      renderWheel(['markdownViewer'], 'markdownViewer', { pointer: { x: 500, y: 10 } });

      expect(screen.getByText('Markdown viewer').closest<HTMLElement>('[data-side]')?.dataset.side).toBe(
        'below',
      );
    });

    it('is hidden from assistive technology, which hears the segment instead', () => {
      renderWheel();

      expect(screen.getByText('Markdown viewer').closest('[aria-hidden="true"]')).toBeTruthy();
    });
  });

  describe('pointing light', () => {
    it('lights the focused segment when the wheel opens', () => {
      renderWheel(['markdownViewer', 'notes'], 'notes');

      expect(litSegmentNames()).toEqual(['Notes']);
    });

    it('lights the pointed segment and names it in the caption', async () => {
      renderWheel(['markdownViewer', 'notes']);
      giveTheWheelABox();

      await pointAt({ x: 0, y: 68 });

      expect(litSegmentNames()).toEqual(['Notes']);
      expect(screen.getByText('Notes')).toBeTruthy();
    });

    it('lights only one segment at a time', async () => {
      renderWheel();
      giveTheWheelABox();

      await pointAt({ x: 50, y: 40 });
      await pointAt({ x: -50, y: 40 });

      expect(litSegmentNames()).toEqual(['Spec viewer']);
    });

    it('returns the light to the focused segment when the pointer leaves', async () => {
      renderWheel(['markdownViewer', 'notes']);
      giveTheWheelABox();
      await pointAt({ x: 0, y: 68 });

      await fireEvent.pointerLeave(menu());

      expect(litSegmentNames()).toEqual(['Markdown viewer']);
    });

    it('lights the segment in the direction of a pointer in the edge band', async () => {
      renderWheel(['markdownViewer', 'notes']);
      giveTheWheelABox();

      await pointAt({ x: 0, y: 96 + 12 });

      expect(litSegmentNames()).toEqual(['Notes']);
    });

    it('chooses the segment in the direction of a click in the edge band', async () => {
      const { onCommand, onClose } = renderWheel(['markdownViewer', 'notes']);
      giveTheWheelABox();

      await clickAt({ x: 0, y: 96 + 12 });

      expect(onCommand).toHaveBeenCalledWith({ kind: 'switchWorkspaceKind', kindId: 'notes' });
      expect(onClose).toHaveBeenCalled();
    });

    it('closes without a change on a click beyond the edge band', async () => {
      const { onCommand, onClose } = renderWheel(['markdownViewer', 'notes']);
      giveTheWheelABox();

      await clickAt({ x: 0, y: 96 + 40 });

      expect(onCommand).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('moves a lit segment outward and grows its icon', async () => {
      stubMatchingMedia();
      renderWheel(['markdownViewer', 'notes']);
      giveTheWheelABox();

      await pointAt({ x: 0, y: 68 });

      expect(segment('Notes').style.getPropertyValue('--lift')).toBe('0px 4px');
      expect(
        segment('Notes').querySelector<HTMLElement>('.icon')?.style.getPropertyValue('--icon-scale'),
      ).not.toBe('');
      expect(segment('Markdown viewer').style.getPropertyValue('--lift')).toBe('');
    });

    it('lights a segment in place without moving or growing it with reduced motion', async () => {
      stubMatchingMedia('(prefers-reduced-motion: reduce)');
      renderWheel(['markdownViewer', 'notes']);
      giveTheWheelABox();

      await pointAt({ x: 0, y: 68 });

      expect(litSegmentNames()).toEqual(['Notes']);
      expect(segment('Notes').style.getPropertyValue('--lift')).toBe('');
      expect(
        segment('Notes').querySelector<HTMLElement>('.icon')?.style.getPropertyValue('--icon-scale'),
      ).toBe('');
    });
  });

  describe('closing', () => {
    it('switches the kind before the close motion ends', async () => {
      stubMatchingMedia();
      const { onCommand, onClosed, rerender } = renderWheel(['markdownViewer', 'notes']);

      await fireEvent.click(segment('Notes'));
      await rerender({ isClosing: true });

      expect(onCommand).toHaveBeenCalledWith({ kind: 'switchWorkspaceKind', kindId: 'notes' });
      expect(onClosed).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Control wheel', hidden: true })).toBeTruthy();
    });

    it('returns the focus as soon as the wheel starts closing', async () => {
      stubMatchingMedia();
      const user = userEvent.setup();
      const editor = document.createElement('button');
      document.body.append(editor);
      editor.focus();
      const { rerender } = renderWheel(['markdownViewer', 'notes']);

      await user.keyboard('2');
      await rerender({ isClosing: true });

      expect(document.activeElement).toBe(editor);
      expect(screen.getByRole('dialog', { name: 'Control wheel', hidden: true })).toBeTruthy();
    });

    it('ignores the pointer while it fades out', async () => {
      stubMatchingMedia();
      const { onCommand, rerender } = renderWheel(['markdownViewer', 'notes']);
      await rerender({ isClosing: true });

      await fireEvent.click(screen.getByRole('menuitemradio', { name: 'Notes', hidden: true }));

      expect(onCommand).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Control wheel', hidden: true }).inert).toBe(true);
    });

    it('asks to be removed once the close motion ends', async () => {
      stubMatchingMedia();
      const { onClosed, rerender } = renderWheel();
      await rerender({ isClosing: true });

      await fireEvent.animationEnd(screen.getByTestId('wheel-surface'));

      expect(onClosed).toHaveBeenCalled();
    });

    it('asks to be removed shortly after closing even when no motion end is reported', async () => {
      stubMatchingMedia();
      vi.useFakeTimers();
      const { onClosed, rerender } = renderWheel();
      await rerender({ isClosing: true });

      vi.advanceTimersByTime(150);

      expect(onClosed).toHaveBeenCalled();
    });

    it('is removed at once with reduced motion', async () => {
      stubMatchingMedia('(prefers-reduced-motion: reduce)');
      const { onClosed, rerender } = renderWheel();

      await rerender({ isClosing: true });

      expect(onClosed).toHaveBeenCalled();
    });

    it('opens again at once when the shortcut is pressed during the fade', async () => {
      stubMatchingMedia();
      vi.useFakeTimers();
      const { onClosed, rerender } = renderWheel(['markdownViewer', 'notes'], 'notes');
      await rerender({ isClosing: true });

      await rerender({ isClosing: false });
      vi.advanceTimersByTime(200);

      expect(onClosed).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Control wheel' }).inert).toBe(false);
      expect(document.activeElement).toBe(segment('Notes'));
    });
  });

  describe('key caps', () => {
    it('hides the numbers when the wheel opens', () => {
      renderWheel();

      expect(keyCaps()).toEqual([]);
    });

    it("shows every segment's number once an arrow key moves the focus", async () => {
      const user = userEvent.setup();
      renderWheel();

      await user.keyboard('{ArrowDown}');

      expect(keyCaps().map((keyCap) => keyCap.textContent)).toEqual(['1', '2', '3']);
    });

    it('shows the numbers once Tab moves the focus', async () => {
      const user = userEvent.setup();
      renderWheel();

      await user.keyboard('{Tab}');

      expect(keyCaps()).toHaveLength(3);
    });

    it('never shows the numbers for pointer movement alone', async () => {
      renderWheel();
      giveTheWheelABox();

      await pointAt({ x: 50, y: 40 });
      await pointAt({ x: 0, y: -68 });

      expect(keyCaps()).toEqual([]);
    });

    it('hides the key caps from assistive technology', async () => {
      const user = userEvent.setup();
      renderWheel();

      await user.keyboard('{End}');

      for (const keyCap of keyCaps()) expect(keyCap.closest('[aria-hidden="true"]')).toBeTruthy();
    });
  });
});
