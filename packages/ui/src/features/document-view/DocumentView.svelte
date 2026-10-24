<script lang="ts">
  import type { ReadingWidth, Typography } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { CodeHighlighter, OutlineEntry, RichBlockRenderer } from '@mdx/renderer';
  import ContextMenu from '../../components/ContextMenu.svelte';
  import { contextMenuPosition } from '../../components/ContextMenuItem';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import type { RenderedActiveDocument } from '../viewer/ViewerController';
  import FindBar from '../find/FindBar.svelte';
  import type { FindQuery } from '../find/findTextRanges';
  import { currentHeadingId } from '../outline/currentHeadingId';
  import type { HeadingRequest } from '../outline/HeadingRequest';
  import type { DocumentLink } from './DocumentLink';
  import PropertiesPanel from './PropertiesPanel.svelte';
  import { untrack } from 'svelte';
  import type { ExportFormat } from '@mdx/platform';
  import { standaloneDocumentHtml } from '../document-export/standaloneDocumentHtml';
  import type { ExportRequest } from '../viewer/ViewerController';
  import { documentClipboardHtml, documentExportHtml, documentPlainText } from './documentClipboardHtml';
  import { enhanceCodeBlocks } from './enhanceCodeBlocks';
  import { findLinkedHeading } from './findLinkedHeading';
  import { revealHeading } from './scrollToHeading';
  import { headingIdInSourceView, scrollSourceLineToTop } from './sourceViewLines';
  import {
    commandForDocumentMenuItem,
    documentContextMenuItems,
    type DocumentMenuItemId,
  } from './documentContextMenu';

  interface Props {
    document: RenderedActiveDocument | undefined;
    zoomPercent: number;
    readingWidth: ReadingWidth;
    typography?: Typography;
    translator: Translator;
    codeHighlighter?: CodeHighlighter | undefined;
    richBlocks?: RichBlockRenderer | undefined;
    findRequest?: number | undefined;
    findQuery?: FindQuery | undefined;
    /** Goes up each time the document should be copied as HTML; the value it starts with is ignored. */
    copyAsHtmlRequest?: number | undefined;
    /** Asks for an exported copy of the document; the request it starts with is ignored. */
    exportRequest?: ExportRequest | undefined;
    /** A heading chosen in the outline; the request it starts with is ignored. */
    headingRequest?: HeadingRequest | undefined;
    locale?: string;
    isSourceView?: boolean;
    onCloseFind?: () => void;
    onOpenLink: (link: DocumentLink) => void;
    onScroll?: (scrollRatio: number) => void;
    onCurrentHeadingChange?: (headingId: string | undefined) => void;
    onCommand?: (command: ViewerCommand) => void;
    isOutlineVisible?: boolean;
    isFavourite?: boolean;
    canBeFavourite?: boolean;
    /** False for a preview beside the editor, which follows the editor instead of the tab's position. */
    shouldRestoreScroll?: boolean;
  }

  const {
    document,
    zoomPercent,
    readingWidth,
    typography = 'github',
    translator,
    codeHighlighter,
    richBlocks,
    findRequest,
    findQuery,
    copyAsHtmlRequest,
    exportRequest,
    headingRequest,
    locale = 'en',
    isSourceView = false,
    onCloseFind = () => undefined,
    onOpenLink,
    onScroll = () => undefined,
    onCurrentHeadingChange = () => undefined,
    onCommand = () => undefined,
    isOutlineVisible = true,
    isFavourite = false,
    canBeFavourite = true,
    shouldRestoreScroll = true,
  }: Props = $props();

  const SCROLL_REPORT_DELAY_MS = 250;
  let documentArea: HTMLElement | undefined = $state();
  let restoredDocument: RenderedActiveDocument | undefined;
  let pendingScrollReport: ReturnType<typeof globalThis.setTimeout> | undefined;

  $effect(() => {
    const area = documentArea;
    if (!shouldRestoreScroll || !document || !area || document === restoredDocument) return;
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
      if (articleElement) onCurrentHeadingChange(headingAtTopOf(articleElement, area));
    }, SCROLL_REPORT_DELAY_MS);
  }

  function headingAtTopOf(article: HTMLElement, area: HTMLElement): string | undefined {
    if (!isSourceView) return currentHeadingId(article, area);
    const sourceView = article.querySelector('pre');
    return sourceView && document ? headingIdInSourceView(area, sourceView, document.outline) : undefined;
  }

  let handledHeadingRequest = untrack(() => headingRequest);

  $effect(() => {
    const request = headingRequest;
    if (request === undefined || request === handledHeadingRequest) return;
    handledHeadingRequest = request;
    goToHeading(request.entry);
  });

  function goToHeading(entry: OutlineEntry) {
    const area = documentArea;
    const article = articleElement;
    if (!area || !article) return;
    if (isSourceView) {
      const sourceView = article.querySelector('pre');
      if (sourceView) scrollSourceLineToTop(area, sourceView, entry.line);
      return;
    }
    const heading = article.ownerDocument.getElementById(entry.id);
    if (heading && article.contains(heading)) revealHeading(heading);
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

  let handledCopyRequest = untrack(() => copyAsHtmlRequest);
  let handledExportRequest = untrack(() => exportRequest);

  $effect(() => {
    const request = exportRequest;
    if (request === undefined || request === handledExportRequest) return;
    handledExportRequest = request;
    exportDocument(request.format);
  });

  function exportDocument(format: ExportFormat) {
    if (!articleElement || !document) return;
    const contents =
      format === 'html'
        ? standaloneDocumentHtml({
            title: document.fileName,
            locale,
            typography,
            bodyHtml: documentExportHtml(articleElement),
          })
        : documentPlainText(articleElement);
    onCommand({ kind: 'saveExport', format, contents });
  }

  $effect(() => {
    const request = copyAsHtmlRequest;
    if (request === undefined || request === handledCopyRequest) return;
    handledCopyRequest = request;
    copyAsHtml();
  });

  function copyAsHtml() {
    if (!articleElement || isSourceView) return;
    onCommand({ kind: 'copyHtml', html: documentClipboardHtml(articleElement, globalThis.getSelection()) });
  }

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
    if (itemId === 'copyAsHtml') copyAsHtml();
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
      const heading = articleElement ? findLinkedHeading(articleElement, link.hash.slice(1)) : undefined;
      if (heading) revealHeading(heading);
      return;
    }
    const kind = link.dataset.mdxLink;
    const href = link.getAttribute('href');
    if (href && (kind === 'document' || kind === 'external')) onOpenLink({ kind, href });
  }
</script>

<!-- Focusable so keyboard users can scroll a document that has no links or other controls. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<main
  bind:this={documentArea}
  class="document-area"
  tabindex="0"
  style:--reading-measure={READING_MEASURES[readingWidth]}
  onscroll={reportScroll}
>
  {#if document && findRequest !== undefined}
    <FindBar
      searchRoot={articleElement}
      contentKey={isSourceView ? document.source : document.html}
      focusRequest={findRequest}
      initialQuery={findQuery}
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
      data-typography={typography}
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
