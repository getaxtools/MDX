<script lang="ts">
  import type { ReadingWidth } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { CodeHighlighter } from '@mdx/renderer';
  import ContextMenu from '../../components/ContextMenu.svelte';
  import { contextMenuPosition, type ContextMenuItem } from '../../components/ContextMenuItem';
  import type { RenderedActiveDocument } from '../viewer/ViewerController';
  import FindBar from '../find/FindBar.svelte';
  import { currentHeadingId } from '../outline/currentHeadingId';
  import type { DocumentLink } from './DocumentLink';
  import PropertiesPanel from './PropertiesPanel.svelte';
  import { enhanceCodeBlocks } from './enhanceCodeBlocks';
  import { scrollToHeading } from './scrollToHeading';

  interface Props {
    document: RenderedActiveDocument | undefined;
    zoomPercent: number;
    readingWidth: ReadingWidth;
    translator: Translator;
    codeHighlighter?: CodeHighlighter | undefined;
    findRequest?: number | undefined;
    isSourceView?: boolean;
    onCloseFind?: () => void;
    onOpenLink: (link: DocumentLink) => void;
    onScroll?: (scrollRatio: number) => void;
    onCurrentHeadingChange?: (headingId: string | undefined) => void;
  }

  const {
    document,
    zoomPercent,
    readingWidth,
    translator,
    codeHighlighter,
    findRequest,
    isSourceView = false,
    onCloseFind = () => undefined,
    onOpenLink,
    onScroll = () => undefined,
    onCurrentHeadingChange = () => undefined,
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

  const PERCENT = 100;
  const READING_MEASURES: Readonly<Record<ReadingWidth, string>> = {
    narrow: '60ch',
    medium: '72ch',
    wide: '96ch',
    full: 'none',
  };

  type DocumentMenuItemId = 'copy' | 'selectAll';

  let articleElement: HTMLElement | undefined = $state();
  let menuRequest: { readonly x: number; readonly y: number; readonly selectedText: string } | undefined =
    $state();

  const menuItems = $derived<ContextMenuItem<DocumentMenuItemId>[]>([
    { id: 'copy', label: translator.translate('menu.edit.copy'), isDisabled: !menuRequest?.selectedText },
    { id: 'selectAll', label: translator.translate('menu.edit.selectAll') },
  ]);

  function openMenu(event: MouseEvent) {
    event.preventDefault();
    menuRequest = {
      ...contextMenuPosition(event),
      selectedText: globalThis.getSelection()?.toString() ?? '',
    };
  }

  function chooseMenuItem(itemId: DocumentMenuItemId) {
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
