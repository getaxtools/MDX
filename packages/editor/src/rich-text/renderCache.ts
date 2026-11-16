const MAX_CACHED_RENDERS = 200;
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
