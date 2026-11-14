import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state';

export type SectionAction = 'moveUp' | 'moveDown' | 'promote' | 'demote';

export type SectionRefusal = 'notAHeading' | 'atEdge' | 'underlinedHeading' | 'atTopLevel' | 'atLowestLevel';

export type SectionChange =
  | { readonly outcome: 'changed'; readonly spec: TransactionSpec }
  | { readonly outcome: 'refused'; readonly refusal: SectionRefusal };

interface Heading {
  readonly level: number;
  /** Start of the heading's line. */
  readonly from: number;
  readonly isUnderlined: boolean;
}

/** A heading and everything up to the next heading of the same or a higher level. */
export interface Section {
  readonly heading: Heading;
  readonly from: number;
  readonly to: number;
}

const PARSE_TIMEOUT_MS = 200;
const ATX_HEADING = /^ATXHeading([1-6])$/;
const SETEXT_HEADING = /^SetextHeading([12])$/;
const ATX_MARKER = /^(\s{0,3})(#{1,6})(?=\s|$)/;
const MAX_HEADING_LEVEL = 6;

/** Moves, promotes or demotes the section whose heading starts on a zero-based line. */
export function sectionChange(state: EditorState, headingLine: number, action: SectionAction): SectionChange {
  const headings = headingsOf(state);
  const sections = sectionsOf(state, headings);
  const index = sections.findIndex((section) => state.doc.lineAt(section.from).number - 1 === headingLine);
  const section = sections[index];
  if (!section) return refused('notAHeading');
  if (action === 'moveUp' || action === 'moveDown') return moveSection(state, sections, { section, action });
  return changeLevels(state, headings, { section, step: action === 'promote' ? -1 : 1 });
}

export type SectionTextChange =
  | { readonly outcome: 'changed'; readonly text: string }
  | { readonly outcome: 'refused'; readonly refusal: SectionRefusal };

/** The same change on plain text, for a document that is not open in the editor. */
export function changeSectionInText(
  text: string,
  headingLine: number,
  action: SectionAction,
): SectionTextChange {
  const state = EditorState.create({ doc: text, extensions: [markdown({ base: markdownLanguage })] });
  const change = sectionChange(state, headingLine, action);
  if (change.outcome === 'refused') return change;
  return { outcome: 'changed', text: state.update(change.spec).state.doc.toString() };
}

export function sectionsOf(state: EditorState, headings: readonly Heading[] = headingsOf(state)): Section[] {
  return headings.map((heading, index) => {
    const next = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level);
    return { heading, from: heading.from, to: next ? next.from : state.doc.length };
  });
}

function headingsOf(state: EditorState): Heading[] {
  const tree = ensureSyntaxTree(state, state.doc.length, PARSE_TIMEOUT_MS);
  if (!tree) return [];
  const headings: Heading[] = [];
  tree.iterate({
    enter: (node) => {
      const atx = ATX_HEADING.exec(node.name);
      const setext = SETEXT_HEADING.exec(node.name);
      const level = Number(atx?.[1] ?? setext?.[1] ?? 0);
      if (level > 0)
        headings.push({ level, from: state.doc.lineAt(node.from).from, isUnderlined: setext !== null });
      return undefined;
    },
  });
  return headings;
}

/** A section moves past its neighbour of the same level under the same parent heading. */
function moveSection(
  state: EditorState,
  sections: readonly Section[],
  { section, action }: { section: Section; action: 'moveUp' | 'moveDown' },
): SectionChange {
  const siblings = sections.filter(
    (candidate) =>
      candidate.heading.level === section.heading.level && sameParent(sections, candidate, section),
  );
  const position = siblings.indexOf(section);
  const neighbour = siblings[action === 'moveUp' ? position - 1 : position + 1];
  if (!neighbour) return refused('atEdge');
  const [first, second] = action === 'moveUp' ? [neighbour, section] : [section, neighbour];
  const firstEnd = contentEndOf(state, first);
  const secondEnd = contentEndOf(state, second);
  const firstText = state.sliceDoc(first.from, firstEnd);
  const secondText = state.sliceDoc(second.from, secondEnd);
  const gap = state.sliceDoc(firstEnd, second.from);
  const movedStart = action === 'moveUp' ? first.from : first.from + secondText.length + gap.length;
  return {
    outcome: 'changed',
    spec: {
      changes: { from: first.from, to: secondEnd, insert: secondText + gap + firstText },
      selection: EditorSelection.cursor(movedStart),
      userEvent: 'move.section',
      scrollIntoView: true,
    },
  };
}

/** The blank lines after a section stay where they are when it moves, as between blocks. */
function contentEndOf(state: EditorState, section: Section): number {
  return section.from + state.sliceDoc(section.from, section.to).trimEnd().length;
}

function sameParent(sections: readonly Section[], first: Section, second: Section): boolean {
  return parentOf(sections, first) === parentOf(sections, second);
}

function parentOf(sections: readonly Section[], section: Section): Section | undefined {
  return sections
    .filter((candidate) => candidate.heading.level < section.heading.level && candidate.from < section.from)
    .at(-1);
}

/** Only the heading markers change; the text of the section stays as it is. */
function changeLevels(
  state: EditorState,
  headings: readonly Heading[],
  { section, step }: { section: Section; step: 1 | -1 },
): SectionChange {
  const inSection = headings.filter((heading) => heading.from >= section.from && heading.from < section.to);
  if (inSection.some((heading) => heading.isUnderlined)) return refused('underlinedHeading');
  const levels = inSection.map((heading) => heading.level + step);
  if (levels.some((level) => level < 1)) return refused('atTopLevel');
  if (levels.some((level) => level > MAX_HEADING_LEVEL)) return refused('atLowestLevel');
  const changes = inSection.map((heading) => {
    const line = state.doc.lineAt(heading.from);
    const [, indentation = '', marks = ''] = ATX_MARKER.exec(line.text) ?? [];
    const from = line.from + indentation.length;
    return { from, to: from + marks.length, insert: '#'.repeat(heading.level + step) };
  });
  return { outcome: 'changed', spec: { changes, userEvent: 'input.format' } };
}

function refused(refusal: SectionRefusal): SectionChange {
  return { outcome: 'refused', refusal };
}
