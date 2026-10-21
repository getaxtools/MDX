import MarkdownIt from 'markdown-it';
import abbreviations from 'markdown-it-abbr';
import definitionLists from 'markdown-it-deflist';
import emoji from 'markdown-it-emoji/lib/bare.mjs';
import emojiByName from 'markdown-it-emoji/lib/data/full.mjs';
import marks from 'markdown-it-mark';
import subscripts from 'markdown-it-sub';
import superscripts from 'markdown-it-sup';
import { splitFrontMatter } from './front-matter/splitFrontMatter';
import {
  headingAnchorsPlugin,
  type OutlineEntry,
  type OutlineEnvironment,
} from './plugins/headingAnchorsPlugin';
import { alertsPlugin, ENGLISH_ALERT_TITLES, type AlertTitles } from './plugins/alertsPlugin';
import { footnotesPlugin } from './plugins/footnotesPlugin';
import { mathPlugin } from './plugins/mathPlugin';
import { sourceLinesPlugin, type SourceLinesEnvironment } from './plugins/sourceLinesPlugin';
import { taskListPlugin } from './plugins/taskListPlugin';
import {
  createHtmlSanitizer,
  type BrowserWindow,
  type ResourceUrlResolver,
} from './sanitize/createHtmlSanitizer';

export interface RenderedDocument {
  readonly html: string;
  readonly outline: readonly OutlineEntry[];
  readonly frontMatter?: string;
}

export interface MarkdownRendererOptions {
  readonly window: BrowserWindow;
  readonly resolveResourceUrl?: ResourceUrlResolver;
  /** Titles of GitHub alerts such as `[!NOTE]`, in the language of the app. */
  readonly alertTitles?: AlertTitles;
}

export interface RenderOptions {
  /** Resolves relative image references for this document; replaces the renderer-wide resolver. */
  readonly resolveResourceUrl?: ResourceUrlResolver;
  /** Marks blocks with the source line they start on, so a preview can scroll with the editor. */
  readonly includeSourceLines?: boolean;
}

export interface MarkdownRenderer {
  render(source: string, options?: RenderOptions): RenderedDocument;
}

export function createMarkdownRenderer({
  window,
  resolveResourceUrl,
  alertTitles = ENGLISH_ALERT_TITLES,
}: MarkdownRendererOptions): MarkdownRenderer {
  const markdown = new MarkdownIt({ html: true, linkify: true, typographer: false })
    .use(footnotesPlugin)
    .use(definitionLists)
    .use(abbreviations)
    .use(subscripts)
    .use(superscripts)
    .use(marks)
    // Emoticons such as :) stay as typed; GitHub converts only :shortcodes:.
    .use(emoji, { defs: emojiByName, shortcuts: {}, enabled: [] })
    .use(alertsPlugin, alertTitles)
    .use(taskListPlugin)
    .use(mathPlugin)
    .use(headingAnchorsPlugin)
    .use(sourceLinesPlugin);
  const sanitizeHtml = createHtmlSanitizer(window);

  return {
    render(source, options = {}) {
      const { frontMatter, body } = splitFrontMatter(source);
      const environment: OutlineEnvironment & SourceLinesEnvironment = { outline: [] };
      const shouldMarkSourceLines = options.includeSourceLines === true;
      if (shouldMarkSourceLines) environment.sourceLineOffset = lineCountOf(source) - lineCountOf(body);
      const html = sanitizeHtml(
        markdown.render(body, environment),
        options.resolveResourceUrl ?? resolveResourceUrl,
        { keepSourceLines: shouldMarkSourceLines },
      );
      return frontMatter === undefined
        ? { html, outline: environment.outline }
        : { html, outline: environment.outline, frontMatter };
    },
  };
}

function lineCountOf(text: string): number {
  return text.split(/\r?\n/).length;
}
