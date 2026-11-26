const MAX_CACHED_RENDERS = 200;
/** The kinds of render whose cache key names their document after the kind, as `table:<document>:<source>`. */
const DOCUMENT_RENDER_KINDS = ['table', 'html', 'image'];
/** About 2 MB of HTML, counted in UTF-16 code units. */
const MAX_CACHED_CHARACTERS = 1_000_000;

/**
 * Rendered HTML by kind and source, shared by every editor, so a block scrolled back into view or
 * shown in another tab is not rendered again. The least recently used entries go first.
 */
export class RenderCache {
  private readonly entries = new Map<string, string>();
  private characterCount = 0;

  get(key: string): string | undefined {
    const html = this.entries.get(key);
    if (html === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, html);
    return html;
  }

  set(key: string, html: string): void {
    this.remove(key);
    this.entries.set(key, html);
    this.characterCount += html.length;
    while (this.entries.size > MAX_CACHED_RENDERS || this.characterCount > MAX_CACHED_CHARACTERS) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) return;
      this.remove(oldest.value);
    }
  }

  /** Drops every render of one document, as when a protected note closes. */
  forgetDocument(documentKey: string): void {
    const prefixes = DOCUMENT_RENDER_KINDS.map((kind) => `${kind}:${documentKey}:`);
    for (const key of [...this.entries.keys()]) {
      if (prefixes.some((prefix) => key.startsWith(prefix))) this.remove(key);
    }
  }

  /** Whether any render holds this text, in its key or its HTML. */
  holdsText(text: string): boolean {
    return [...this.entries].some(([key, html]) => key.includes(text) || html.includes(text));
  }

  get size(): number {
    return this.entries.size;
  }

  private remove(key: string): void {
    const html = this.entries.get(key);
    if (html === undefined) return;
    this.characterCount -= html.length;
    this.entries.delete(key);
  }
}

export const SHARED_RENDER_CACHE = new RenderCache();
