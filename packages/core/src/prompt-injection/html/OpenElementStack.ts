import type { HtmlOpenTag } from './scanHtml';

export interface OpenElement<Reason> {
  readonly tag: HtmlOpenTag;
  readonly reasons: readonly Reason[];
  /** Where the hidden content starts; a summary moves it past the visible title of a details element. */
  contentFrom: number;
  /** Normalised `bgcolor` of the element, if it has one. */
  readonly backgroundColor?: string;
}

function increment(counts: Map<string, number>, key: string, step: number): void {
  const count = (counts.get(key) ?? 0) + step;
  if (count > 0) counts.set(key, count);
  else counts.delete(key);
}

/**
 * The elements open at the current point of the document. Counts per tag name and per background colour
 * keep every operation amortised constant, so a document of thousands of unclosed tags stays quick.
 */
export class OpenElementStack<Reason> {
  private readonly elements: OpenElement<Reason>[] = [];
  private readonly openCountByName = new Map<string, number>();
  private readonly openCountByBackground = new Map<string, number>();
  private readonly openDetails: OpenElement<Reason>[] = [];

  push(element: OpenElement<Reason>): void {
    this.elements.push(element);
    increment(this.openCountByName, element.tag.name, 1);
    if (element.backgroundColor !== undefined)
      increment(this.openCountByBackground, element.backgroundColor, 1);
    if (element.tag.name === 'details') this.openDetails.push(element);
  }

  /** Closes the innermost open element with this name and every element opened inside it, innermost first. */
  closeUpTo(name: string): OpenElement<Reason>[] {
    if (!this.openCountByName.has(name)) return [];
    const closed: OpenElement<Reason>[] = [];
    for (let element = this.pop(); element; element = this.pop()) {
      closed.push(element);
      if (element.tag.name === name) break;
    }
    return closed;
  }

  innermostDetails(): OpenElement<Reason> | undefined {
    return this.openDetails.at(-1);
  }

  hasOpenBackground(color: string): boolean {
    return this.openCountByBackground.has(color);
  }

  /** Every element still open, innermost first, emptying the stack. */
  closeAll(): OpenElement<Reason>[] {
    const closed: OpenElement<Reason>[] = [];
    for (let element = this.pop(); element; element = this.pop()) closed.push(element);
    return closed;
  }

  private pop(): OpenElement<Reason> | undefined {
    const element = this.elements.pop();
    if (!element) return undefined;
    increment(this.openCountByName, element.tag.name, -1);
    if (element.backgroundColor !== undefined)
      increment(this.openCountByBackground, element.backgroundColor, -1);
    if (element.tag.name === 'details') this.openDetails.pop();
    return element;
  }
}
