import type { RichTextRendering } from '@mdx/editor';
import type { Translator } from '@mdx/i18n';
import { CALLOUT_TYPES, calloutLookOf, type CalloutType, type RichBlockRenderer } from '@mdx/renderer';
import { showBlockedRemoteImages } from '../document-view/showBlockedRemoteImages';

export interface RichTextRenderingOptions {
  readonly documentKey: string;
  /** A protected note keeps its renders out of the cache other documents share. */
  readonly keepsRendersPrivate: boolean;
  /** The preview's renderer and sanitizer, resolving pictures and links for this document. */
  readonly renderMarkdown: (markdown: string) => string;
  readonly richBlocks: RichBlockRenderer | undefined;
  readonly translator: Translator;
}

/** The sanitized HTML with the preview's notes for remote pictures it left out, built where nothing loads. */
function withBlockedImageNotes(html: string, translator: Translator): string {
  const template = globalThis.document.createElement('template');
  template.innerHTML = html;
  showBlockedRemoteImages(template.content, translator);
  return template.innerHTML;
}

function calloutTitle(type: string, ownTitle: string, translator: Translator): string {
  if (ownTitle !== '') return ownTitle;
  const known = CALLOUT_TYPES.find((candidate): candidate is CalloutType => candidate === type.toLowerCase());
  return known ? translator.translate(`document.alert.${known}`) : type;
}

/** Rich text renders its widgets with exactly what the preview of the same document shows. */
export function createRichTextRendering({
  documentKey,
  keepsRendersPrivate,
  renderMarkdown,
  richBlocks,
  translator,
}: RichTextRenderingOptions): RichTextRendering {
  return {
    documentKey,
    keepsRendersPrivate,
    renderBlock: (markdown) => withBlockedImageNotes(renderMarkdown(markdown), translator),
    typesetMath: (tex, isDisplay) => richBlocks?.typesetMath(tex, isDisplay) ?? Promise.resolve(undefined),
    callout: (type, ownTitle) => {
      const look = calloutLookOf(type);
      return look ? { look, title: calloutTitle(type, ownTitle, translator) } : undefined;
    },
    labels: {
      formula: (source) => translator.translate('editor.richText.formula', { source }),
      table: (rows, columns) => translator.translate('editor.richText.table', { rows, columns }),
      properties: (count) => translator.translate('editor.richText.properties', { count }),
      diagram: (type) => translator.translate('editor.richText.diagram', { type }),
      task: () => translator.translate('editor.richText.task'),
      tableTooLarge: () => translator.translate('editor.richText.tableTooLarge'),
    },
  };
}
