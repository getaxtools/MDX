import MarkdownIt from 'markdown-it';
import { splitFrontMatter } from './front-matter/splitFrontMatter';
import {
  headingAnchorsPlugin,
  type OutlineEntry,
  type OutlineEnvironment,
} from './plugins/headingAnchorsPlugin';
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
}

export interface MarkdownRenderer {
  render(source: string): RenderedDocument;
}

export function createMarkdownRenderer({
  window,
  resolveResourceUrl,
}: MarkdownRendererOptions): MarkdownRenderer {
  const markdown = new MarkdownIt({ html: true, linkify: true, typographer: false })
    .use(taskListPlugin)
    .use(headingAnchorsPlugin);
  const sanitizeHtml = createHtmlSanitizer(window, resolveResourceUrl);

  return {
    render(source) {
      const { frontMatter, body } = splitFrontMatter(source);
      const environment: OutlineEnvironment = { outline: [] };
      const html = sanitizeHtml(markdown.render(body, environment));
      return frontMatter === undefined
        ? { html, outline: environment.outline }
        : { html, outline: environment.outline, frontMatter };
    },
  };
}
