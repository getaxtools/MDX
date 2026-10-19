<script lang="ts">
  import type { ReadingWidth } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { CodeHighlighter, RichBlockRenderer } from '@mdx/renderer';
  import ContextMenu from '../../components/ContextMenu.svelte';
  import { contextMenuPosition } from '../../components/ContextMenuItem';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import type { RenderedActiveDocument } from '../viewer/ViewerController';
  import FindBar from '../find/FindBar.svelte';
  import { currentHeadingId } from '../outline/currentHeadingId';
  import type { DocumentLink } from './DocumentLink';
  import PropertiesPanel from './PropertiesPanel.svelte';
  import { enhanceCodeBlocks } from './enhanceCodeBlocks';
  import { scrollToHeading } from './scrollToHeading';
  import {
    commandForDocumentMenuItem,
    documentContextMenuItems,
    type DocumentMenuItemId,
  } from './documentContextMenu';

  interface Props {
    document: RenderedActiveDocument | undefined;
    zoomPercent: number;
    readingWidth: ReadingWidth;
    translator: Translator;
    codeHighlighter?: CodeHighlighter | undefined;
    richBlocks?: RichBlockRenderer | undefined;
    findRequest?: number | undefined;
    isSourceView?: boolean;
    onCloseFind?: () => void;
    onOpenLink: (link: DocumentLink) => void;
    onScroll?: (scrollRatio: number) => void;
    onCurrentHeadingChange?: (headingId: string | undefined) => void;
    onCommand?: (command: ViewerCommand) => void;
    isOutlineVisible?: boolean;
    isFavourite?: boolean;
    canBeFavourite?: boolean;
  }

  const {
    document,
    zoomPercent,
    readingWidth,
    translator,
    codeHighlighter,
    richBlocks,
    findRequest,
    isSourceView = false,
    onCloseFind = () => undefined,
    onOpenLink,
    onScroll = () => undefined,
    onCurrentHeadingChange = () => undefined,
    onCommand = () => undefined,
    isOutlineVisible = true,
    isFavourite = false,
    canBeFavourite = true,
  }: Props = $props();

  const SCROLL_REPORT_DELAY_MS = 250;
  let documentArea: HTMLElement | undefined = $state();
  let restoredDocument: RenderedActiveDocument | undefined;
  let pendingScrollReport: ReturnType<typeof globalThis.setTimeout> | undefined;

  $effect(() => {
    const area = documentArea;
    if (!document || !area || document === restoredDocument) return;
    restoredDocument = document;
    area.scrollTop = document.scrollRatio * Math.max(area.scrollHeight - area.clientHeight, 0);
  });

  $effect(() => {
    const area = documentArea;
    if (!area) return;
    // Registered by hand because a passive wheel listener cannot stop the page from scrolling.
    const zoomWithWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault();
      onCommand({ kind: event.deltaY < 0 ? 'zoomIn' : 'zoomOut' });
    };
    area.addEventListener('wheel', zoomWithWheel, { passive: false });
    return () => area.removeEventListener('wheel', zoomWithWheel);
  });

  function reportScroll() {
    globalThis.clearTimeout(pendingScrollReport);
    pendingScrollReport = globalThis.setTimeout(() => {
      const area = documentArea;
      if (!area) return;
      const scrollableHeight = area.scrollHeight - area.clientHeight;
      onScroll(scrollableHeight > 0 ? area.scrollTop / scrollableHeight : 0);
      if (articleElement) onCurrentHeadingChange(currentHeadingId(articleElement, area));
    }, SCROLL_REPORT_DELAY_MS);
  }

  $effect(() => {
    const article = articleElement;
    if (!document?.html || !article || (isSourceView && !document.source)) return;
    let isStillShown = true;
    void enhanceCodeBlocks(article, {
      highlighter: codeHighlighter,
      translator,
      isStillShown: () => isStillShown,
      writeClipboard: (text) => globalThis.navigator.clipboard.writeText(text),
    });
    return () => (isStillShown = false);
  });

  $effect(() => {
    const article = articleElement;
    if (!document?.html || !article || isSourceView || !richBlocks) return;
    let isStillShown = true;
    void richBlocks.renderInto(article, { isStillShown: () => isStillShown });
    return () => (isStillShown = false);
  });

  const PERCENT = 100;
  const READING_MEASURES: Readonly<Record<ReadingWidth, string>> = {
    narrow: '60ch',
    medium: '72ch',
    wide: '96ch',
    full: 'none',
  };

  let articleElement: HTMLElement | undefined = $state();
  let menuRequest: { readonly x: number; readonly y: number; readonly selectedText: string } | undefined =
    $state();

  const menuItems = $derived(
    documentContextMenuItems(
      {
        hasSelection: Boolean(menuRequest?.selectedText),
        isSourceView,
        isOutlineVisible,
        isFavourite,
        canBeFavourite,
      },
      translator,
    ),
  );

  function openMenu(event: MouseEvent) {
    event.preventDefault();
    menuRequest = {
      ...contextMenuPosition(event),
      selectedText: globalThis.getSelection()?.toString() ?? '',
    };
  }

  function chooseMenuItem(itemId: DocumentMenuItemId) {
    const command = commandForDocumentMenuItem(itemId);
    if (command) onCommand(command);
    if (itemId === 'copy' && menuRequest?.selectedText)
      void globalThis.navigator.clipboard.writeText(menuRequest.selectedText);
    if (itemId === 'selectAll' && articleElement)
      globalThis.getSelection()?.selectAllChildren(articleElement);
  }

  function handleClick(event: MouseEvent) {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a');
    if (!link) return;
    // The webview must never navigate away from the app, so every link is handled here.
    event.preventDefault();
    if (link.dataset.mdxLink === 'anchor') {
      scrollToHeading(globalThis.document, decodeURIComponent(link.hash.slice(1)));
      return;
    }
    const kind = link.dataset.mdxLink;
    const href = link.getAttribute('href');
    if (href && (kind === 'document' || kind === 'external')) onOpenLink({ kind, href });
  }
</script>

<main
  bind:this={documentArea}
  class="document-area"
  style:--reading-measure={READING_MEASURES[readingWidth]}
  onscroll={reportScroll}
>
  {#if document && findRequest !== undefined}
    <FindBar
      searchRoot={articleElement}
      contentKey={isSourceView ? document.source : document.html}
      focusRequest={findRequest}
      {translator}
      onClose={onCloseFind}
    />
  {/if}
  {#if document?.frontMatter !== undefined}
    <PropertiesPanel frontMatter={document.frontMatter} {translator} />
  {/if}
  {#if document}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <article
      bind:this={articleElement}
      class="rendered-document"
      aria-label={document.fileName}
      style:zoom={zoomPercent / PERCENT}
      onclick={handleClick}
      oncontextmenu={openMenu}
    >
      {#if isSourceView}
        <pre class="source-view"><code class="language-markdown">{document.source}</code></pre>
      {:else}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html document.html}
      {/if}
    </article>
  {:else}
    <p class="empty-state">{translator.translate('document.emptyState')}</p>
  {/if}
</main>
{#if menuRequest}
  <ContextMenu
    label={translator.translate('document.contextMenu.label')}
    items={menuItems}
    position={menuRequest}
    onChoose={chooseMenuItem}
    onClose={() => (menuRequest = undefined)}
  />
{/if}

<style>
  .document-area {
    overflow-y: auto;
    background: var(--color-background);
  }

  .empty-state {
    margin: var(--space-8) auto;
    max-width: var(--reading-measure);
    padding: 0 var(--space-6);
    color: var(--color-text-secondary);
    text-align: center;
  }
</style>
