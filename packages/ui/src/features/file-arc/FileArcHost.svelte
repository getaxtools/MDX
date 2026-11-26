<script lang="ts">
  import type { CtrlWheelAction, FileArcDirection, WorkspaceKindId } from '@mdx/core';
  import type { MessageKey, Translator } from '@mdx/i18n';
  import type { DocumentLocation } from '@mdx/platform';
  import { tick } from 'svelte';
  import type { FileArcControls } from './fileArcCommands';
  import { listenToFileArcGesture } from './fileArcGesture';
  import { FileArcSession, type FileArcEnd, type FileArcList, type ShownFileArc } from './FileArcSession';
  import { emptyListKey, keptCurrentText, type FileArcWording } from './fileArcText';
  import { readLastEdited, relativeTimeText, type LastEditedReader } from './lastEditedText';

  interface Props {
    /** How the arc names what it lists; undefined in a kind that has no arc. */
    wording: FileArcWording | undefined;
    kindId: WorkspaceKindId;
    ctrlWheelAction: CtrlWheelAction;
    /** Read when the arc opens, so the list is the tree as it is at that moment. */
    list: () => FileArcList;
    translator: Translator;
    onOpen: (location: DocumentLocation) => Promise<void>;
    onNotice: (key: MessageKey) => void;
    onFocusDocument: () => void;
    /** Hands over what the window's keys and the document's wheel call. */
    onControls: (controls: FileArcControls) => void;
    /** Reads the highlighted file's modified time for the card; without it the card leaves it out. */
    readModifiedTime?: LastEditedReader | undefined;
    nowMs?: () => number;
  }

  const {
    wording,
    kindId,
    ctrlWheelAction,
    list,
    translator,
    onOpen,
    onNotice,
    onFocusDocument,
    onControls,
    readModifiedTime,
    nowMs = () => Date.now(),
  }: Props = $props();

  type FileArcComponent = typeof import('./FileArc.svelte').default;
  let fileArcComponent: Promise<FileArcComponent> | undefined;
  let shown: ShownFileArc | undefined = $state.raw();
  /** A closed arc stays in the page while it fades out. */
  let fading: ShownFileArc | undefined = $state.raw();
  /** Each opening gets a fresh arc, so it takes the focus even while the last one fades. */
  let openingNumber = $state(0);
  let announcement = $state({ text: '', number: 0 });
  let focusBeforeOpening: Element | null = null;
  /** A touchpad pinch reaches the page as the wheel with Ctrl, though Ctrl is not pressed. */
  let isControlKeyDown = false;
  let lastEdited: { readonly key: string; readonly text: string } | undefined = $state.raw();

  const highlightedEntry = $derived(shown?.entries[shown.highlighted]);
  const lastEditedText = $derived(
    lastEdited && lastEdited.key === highlightedEntry?.location.canonicalKey ? lastEdited.text : undefined,
  );

  // One read for the highlighted entry only; an answer for an entry no longer highlighted is not shown.
  $effect(() => {
    const entry = highlightedEntry;
    const read = readModifiedTime;
    if (!entry || !read) return;
    const key = entry.location.canonicalKey;
    void readLastEdited(read, entry.location.displayPath).then((editedAtMs) => {
      if (editedAtMs !== undefined)
        lastEdited = { key, text: relativeTimeText(editedAtMs, nowMs(), translator.locale) };
    });
  });

  const session = new FileArcSession({
    onChange: (next) => {
      if (!shown && next) {
        focusBeforeOpening = globalThis.document.activeElement;
        openingNumber += 1;
      }
      if (shown && !next) fading = shown;
      shown = next;
    },
    onOpen: (location) => void openAndFocus(location),
    onEnd: (end) => finish(end),
    onEmpty: () => {
      if (wording) onNotice(emptyListKey(wording));
    },
  });

  $effect(() => {
    if (!shown) return undefined;
    return listenToFileArcGesture(globalThis, {
      onWheel: (event) => session.turnWheel(event, globalThis.innerHeight, list),
      onChoose: () => session.choose(),
      onCancel: () => session.cancel(),
    });
  });

  function loadFileArc(): Promise<FileArcComponent> {
    fileArcComponent ??= import('./FileArc.svelte').then((module) => module.default);
    return fileArcComponent;
  }

  /** Opens the arc one step from the active document, or moves it; false in a kind without one. */
  function step(direction: FileArcDirection): boolean {
    if (!wording) return false;
    void loadFileArc();
    session.step(direction, list);
    return true;
  }

  /** Ctrl with the mouse wheel over the document: true when it moved between files, false to zoom. */
  function moveWithWheel(event: WheelEvent): boolean {
    if (!wording || ctrlWheelAction !== 'moveBetweenFiles' || !isControlKeyDown) return false;
    void loadFileArc();
    session.turnWheel(event, globalThis.innerHeight, list);
    return true;
  }

  $effect(() => {
    onControls({ step, moveWithWheel });
  });

  function trackControlKey(event: KeyboardEvent) {
    if (event.key !== 'Control') return;
    isControlKeyDown = event.type === 'keydown';
    if (isControlKeyDown && !event.repeat) session.forgetWheelMovement();
  }

  async function openAndFocus(location: DocumentLocation) {
    await onOpen(location);
    await tick();
    onFocusDocument();
  }

  function finish(end: FileArcEnd) {
    if (end.kind === 'kept') returnFocus();
    if (!wording) return;
    const text =
      end.kind === 'opened'
        ? translator.translate('fileArc.opened', { name: end.entry.name })
        : keptCurrentText(wording, translator);
    announcement = { text, number: announcement.number + 1 };
  }

  function returnFocus() {
    const focused = focusBeforeOpening;
    focusBeforeOpening = null;
    if (focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
    else onFocusDocument();
  }
</script>

<svelte:window
  onkeydown={trackControlKey}
  onkeyup={trackControlKey}
  onblur={() => (isControlKeyDown = false)}
/>

{#if wording}
  {@const arc = shown ?? fading}
  {#if arc}
    {#key openingNumber}
      {#await loadFileArc() then FileArc}
        <FileArc
          entries={arc.entries}
          highlighted={arc.highlighted}
          {kindId}
          {wording}
          isClosing={!shown}
          lastEdited={shown ? lastEditedText : undefined}
          {translator}
          onChoose={(index: number) => session.choose(index)}
          onClosed={() => (fading = undefined)}
        />
      {/await}
    {/key}
  {/if}
{/if}
<span class="file-arc-announcement" role="status">
  {#key announcement.number}{announcement.text}{/key}
</span>

<style>
  /* Heard by screen readers, not shown: the arc itself shows what happened. */
  .file-arc-announcement {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
