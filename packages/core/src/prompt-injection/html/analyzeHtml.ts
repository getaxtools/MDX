import type { DocumentStructure, SourceRange } from '../DocumentStructure';
import type { Ruleset } from '../Ruleset';
import { isHidingStyle, normalizeColor, type HidingStyleThresholds } from './isHidingStyle';
import { OpenElementStack, type OpenElement } from './OpenElementStack';
import { scanHtml, type HtmlCloseTag, type HtmlComment, type HtmlOpenTag } from './scanHtml';

export type HtmlHidingReason =
  'style' | 'hiddenAttribute' | 'ariaHidden' | 'fontColor' | 'removedElement' | 'collapsedDetails';

export interface HiddenHtmlContent {
  readonly reason: HtmlHidingReason;
  readonly tagName: string;
  /** From the start of the opening tag to the end of the closing tag. */
  readonly element: SourceRange;
  readonly content: SourceRange;
}

export interface HtmlResource {
  readonly url: string;
  readonly tag: SourceRange;
  readonly alt?: string;
  readonly title?: string;
}

export interface HtmlAnalysis {
  readonly hiddenContents: readonly HiddenHtmlContent[];
  readonly comments: readonly HtmlComment[];
  readonly images: readonly HtmlResource[];
  readonly links: readonly HtmlResource[];
  /** Opening tags of links whose address the sanitizer removes, such as `javascript:`. */
  readonly unsafeLinks: readonly SourceRange[];
}

interface HtmlLists {
  readonly removedContentElements: ReadonlySet<string>;
  readonly voidElements: ReadonlySet<string>;
  readonly pageBackgroundColors: ReadonlySet<string>;
  readonly unsafeLinkPrefixes: readonly string[];
  readonly styleThresholds: HidingStyleThresholds;
}

interface AnalysisState {
  readonly lists: HtmlLists;
  readonly openElements: OpenElementStack<HtmlHidingReason>;
  readonly hiddenContents: HiddenHtmlContent[];
  readonly images: HtmlResource[];
  readonly links: HtmlResource[];
  readonly unsafeLinks: SourceRange[];
}

function listsOf(ruleset: Ruleset, styleThresholds: HidingStyleThresholds): HtmlLists {
  return {
    removedContentElements: new Set(ruleset.list('removedContentElements')),
    voidElements: new Set(ruleset.list('voidElements')),
    pageBackgroundColors: new Set(ruleset.list('pageBackgroundColors').map(normalizeColor)),
    unsafeLinkPrefixes: ruleset.list('unsafeLinkPrefixes'),
    styleThresholds,
  };
}

function isInvisibleFontColor(tag: HtmlOpenTag, state: AnalysisState): boolean {
  const color = tag.attributes.get('color');
  if (tag.name !== 'font' || color === undefined) return false;
  const normalized = normalizeColor(color);
  return state.lists.pageBackgroundColors.has(normalized) || state.openElements.hasOpenBackground(normalized);
}

function hidingReasonsOf(tag: HtmlOpenTag, state: AnalysisState): HtmlHidingReason[] {
  const style = tag.attributes.get('style');
  const reasons: HtmlHidingReason[] = [];
  if (style !== undefined && isHidingStyle(style, state.lists.styleThresholds)) reasons.push('style');
  if (tag.attributes.has('hidden')) reasons.push('hiddenAttribute');
  if (tag.attributes.get('aria-hidden')?.toLowerCase() === 'true') reasons.push('ariaHidden');
  if (isInvisibleFontColor(tag, state)) reasons.push('fontColor');
  if (state.lists.removedContentElements.has(tag.name)) reasons.push('removedElement');
  if (tag.name === 'details' && !tag.attributes.has('open')) reasons.push('collapsedDetails');
  return reasons;
}

function noteResource(tag: HtmlOpenTag, state: AnalysisState): void {
  const range = { from: tag.from, to: tag.to };
  const title = tag.attributes.get('title');
  const withTitle = title === undefined ? {} : { title };
  const source = tag.attributes.get('src');
  if (tag.name === 'img' && source !== undefined) {
    const alt = tag.attributes.get('alt');
    state.images.push({ url: source, tag: range, ...withTitle, ...(alt === undefined ? {} : { alt }) });
  }
  const href = tag.attributes.get('href');
  if (tag.name !== 'a' || href === undefined) return;
  state.links.push({ url: href, tag: range, ...withTitle });
  const scheme = href.trim().toLowerCase().replaceAll(/\s+/g, '');
  if (state.lists.unsafeLinkPrefixes.some((prefix) => scheme.startsWith(prefix)))
    state.unsafeLinks.push(range);
}

function openElement(tag: HtmlOpenTag, state: AnalysisState): void {
  noteResource(tag, state);
  if (tag.isSelfClosing || state.lists.voidElements.has(tag.name)) return;
  const backgroundColor = tag.attributes.get('bgcolor');
  state.openElements.push({
    tag,
    reasons: hidingReasonsOf(tag, state),
    contentFrom: tag.to,
    ...(backgroundColor === undefined ? {} : { backgroundColor: normalizeColor(backgroundColor) }),
  });
}

function finishElement(
  element: OpenElement<HtmlHidingReason>,
  { contentTo, elementTo }: { readonly contentTo: number; readonly elementTo: number },
  state: AnalysisState,
): void {
  for (const reason of element.reasons) {
    state.hiddenContents.push({
      reason,
      tagName: element.tag.name,
      element: { from: element.tag.from, to: elementTo },
      content: { from: element.contentFrom, to: Math.max(element.contentFrom, contentTo) },
    });
  }
}

/** A closing tag also closes the elements left open inside it, as browsers do; one with no opener is ignored. */
function closeElement(tag: HtmlCloseTag, state: AnalysisState): void {
  const closed = state.openElements.closeUpTo(tag.name);
  for (const element of closed) finishElement(element, { contentTo: tag.from, elementTo: tag.to }, state);
  const details = state.openElements.innermostDetails();
  if (tag.name === 'summary' && closed.length > 0 && details) details.contentFrom = tag.to;
}

/**
 * Reads every raw HTML segment in document order and pairs opening and closing tags across them, so a
 * `<div hidden>` block, the Markdown after it and the `</div>` block that closes it make one region.
 */
export function analyzeHtml(
  text: string,
  structure: DocumentStructure,
  {
    ruleset,
    styleThresholds,
  }: { readonly ruleset: Ruleset; readonly styleThresholds: HidingStyleThresholds },
): HtmlAnalysis {
  const lists = listsOf(ruleset, styleThresholds);
  const rawTextElements = new Set(ruleset.list('rawTextElements'));
  const state: AnalysisState = {
    lists,
    openElements: new OpenElementStack<HtmlHidingReason>(),
    hiddenContents: [],
    images: [],
    links: [],
    unsafeLinks: [],
  };
  const comments: HtmlComment[] = [];
  for (const segment of structure.segments) {
    if (segment.kind !== 'html') continue;
    for (const item of scanHtml(text, segment.range, rawTextElements)) {
      if (item.kind === 'comment') comments.push(item);
      else if (item.kind === 'openTag') openElement(item, state);
      else closeElement(item, state);
    }
  }
  for (const element of state.openElements.closeAll())
    finishElement(element, { contentTo: text.length, elementTo: text.length }, state);
  return {
    hiddenContents: state.hiddenContents.sort((left, right) => left.element.from - right.element.from),
    comments,
    images: state.images,
    links: state.links,
    unsafeLinks: state.unsafeLinks,
  };
}
