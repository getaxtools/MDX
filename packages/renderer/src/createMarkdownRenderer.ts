import MarkdownIt from 'markdown-it';
import { splitFrontMatter } from './front-matter/splitFrontMatter';
import {
  headingAnchorsPlugin,
  type OutlineEntry,
  type OutlineEnvironment,
} from './plugins/headingAnchorsPlugin';
import { mathPlugin } from './plugins/mathPlugin';
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

export interface RenderOptions {
  /** Resolves relative image references for this document; replaces the renderer-wide resolver. */
  readonly resolveResourceUrl?: ResourceUrlResolver;
}

export interface MarkdownRenderer {
  render(source: string, options?: RenderOptions): RenderedDocument;
}

export function createMarkdownRenderer({
  window,
  resolveResourceUrl,
}: MarkdownRendererOptions): MarkdownRenderer {
  const markdown = new MarkdownIt({ html: true, linkify: true, typographer: false })
    .use(taskListPlugin)
    .use(mathPlugin)
    .use(headingAnchorsPlugin);
  const sanitizeHtml = createHtmlSanitizer(window);

  return {
    render(source, options = {}) {
      const { frontMatter, body } = splitFrontMatter(source);
      const environment: OutlineEnvironment = { outline: [] };
      const html = sanitizeHtml(
        markdown.render(body, environment),
        options.resolveResourceUrl ?? resolveResourceUrl,
      );
      return frontMatter === undefined
        ? { html, outline: environment.outline }
        : { html, outline: environment.outline, frontMatter };
    },
  };
}
