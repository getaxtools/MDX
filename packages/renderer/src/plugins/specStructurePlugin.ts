import type { MarkdownIt, StateCore, Token } from 'markdown-it';
import type { OutlineEnvironment, OutlineRole } from './headingAnchorsPlugin';

export type DeltaSectionKind = 'added' | 'modified' | 'removed' | 'renamed';

/**
 * How a document of a spec project is marked: a capability's spec, a change's delta of one, a feature's spec
 * with its user stories, or another project document that only gets cross-links.
 */
export interface SpecStructureRendering {
  readonly kind: 'mainSpec' | 'deltaSpec' | 'featureSpec' | 'specDocument';
  /** The visible names of the delta sections, in the language of the app. */
  readonly sectionLabels: Readonly<Record<DeltaSectionKind, string>>;
  /** Where the references in the document lead, by what the document writes. */
  readonly links?: SpecCrossLinks | undefined;
}

/** Targets of the references a spec document makes, as relative document links with a heading anchor. */
export interface SpecCrossLinks {
  /** User story labels such as `US2`. */
  readonly storyLinks?: ReadonlyMap<string, string> | undefined;
  /** Requirement and success criterion identifiers such as `FR-001`. */
  readonly requirementIdLinks?: ReadonlyMap<string, string> | undefined;
  /** Names of the current spec's requirements, for a delta's modified, removed and renamed ones. */
  readonly requirementLinks?: ReadonlyMap<string, string> | undefined;
  /** Capability names, written as code. */
  readonly capabilityLinks?: ReadonlyMap<string, string> | undefined;
}

export type SpecStructureEnvironment = OutlineEnvironment & { specStructure?: SpecStructureRendering };

// The spec tool reads the raw line, so a heading markdown-it accepts with an indent is not one of these.
const DELTA_SECTION_LINE = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements(?:[ \t]+#+)?\s*$/i;
const REQUIREMENT_LINE = /^###\s*Requirement:\s*\S/i;
const SCENARIO_LINE = /^####\s+\S/;
const USER_STORY_LINE = /^###\s+User Story\s+\d+/i;
const CLASS_PREFIX = 'mdx-spec-';

interface MarkingState {
  readonly lines: readonly string[];
  readonly environment: SpecStructureEnvironment;
  readonly rendering: SpecStructureRendering;
  readonly tokens: Token[];
  readonly createToken: (type: 'html_block' | 'html_inline', content: string) => Token;
  isInRequirement: boolean;
}

function sourceLineOf(state: MarkingState, token: Token): string {
  return state.lines[token.map?.[0] ?? -1] ?? '';
}

function addClass(token: Token, name: string): void {
  const existing = token.attrGet('class');
  const added = `${CLASS_PREFIX}${name}`;
  token.attrSet('class', typeof existing === 'string' && existing !== '' ? `${existing} ${added}` : added);
}

function giveRole(state: MarkingState, token: Token, role: OutlineRole): void {
  const line = (token.map?.[0] ?? -1) + (state.environment.outlineLineOffset ?? 0);
  const outline = state.environment.outline;
  const index = outline.findIndex((entry) => entry.line === line);
  const entry = outline[index];
  if (entry) outline[index] = { ...entry, role };
}

function tokenFactoryOf(core: StateCore): MarkingState['createToken'] {
  return (type, content) => {
    const token = new core.Token(type, '', 0);
    token.content = content;
    return token;
  };
}

function escaped(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Puts the section's visible label at the start of its heading, so colour is never the only signal. */
function labelHeading(state: MarkingState, index: number, label: string): void {
  const inline = state.tokens[index + 1];
  if (!inline?.children) return;
  inline.children.unshift(
    state.createToken('html_inline', `<span class="${CLASS_PREFIX}label">${escaped(label)}</span> `),
  );
}

function deltaSectionOf(state: MarkingState, token: Token): DeltaSectionKind | undefined {
  if (state.rendering.kind !== 'deltaSpec' || token.tag !== 'h2') return undefined;
  return DELTA_SECTION_LINE.exec(sourceLineOf(state, token))?.[1]?.toLowerCase() as
    DeltaSectionKind | undefined;
}

function markHeading(state: MarkingState, index: number): DeltaSectionKind | undefined {
  const token = state.tokens[index];
  if (!token) return undefined;
  const section = deltaSectionOf(state, token);
  if (section) {
    giveRole(state, token, 'deltaSection');
    labelHeading(state, index, state.rendering.sectionLabels[section]);
    state.isInRequirement = false;
    return section;
  }
  markRequirementOrScenario(state, token);
  return undefined;
}

function isRequirementHeading(state: MarkingState, line: string): boolean {
  return (state.rendering.kind === 'featureSpec' ? USER_STORY_LINE : REQUIREMENT_LINE).test(line);
}

function markRequirementOrScenario(state: MarkingState, token: Token): void {
  if (state.rendering.kind === 'specDocument') return;
  const line = sourceLineOf(state, token);
  if (token.tag === 'h3') state.isInRequirement = isRequirementHeading(state, line);
  if (token.tag === 'h1' || token.tag === 'h2') state.isInRequirement = false;
  if (!state.isInRequirement) return;
  if (token.tag === 'h3') {
    addClass(token, 'requirement');
    giveRole(state, token, 'requirement');
  } else if (token.tag === 'h4' && state.rendering.kind !== 'featureSpec' && SCENARIO_LINE.test(line)) {
    addClass(token, 'scenario');
    giveRole(state, token, 'scenario');
  }
}

/** Wraps each delta section, from its heading to the next top-level heading, in a labelled section. */
function wrapSections(state: MarkingState, sections: ReadonlyMap<number, DeltaSectionKind>): void {
  if (sections.size === 0) return;
  const wrapped: Token[] = [];
  let isOpen = false;
  for (const [index, token] of state.tokens.entries()) {
    const isTopLevelHeading = token.type === 'heading_open' && (token.tag === 'h1' || token.tag === 'h2');
    if (isTopLevelHeading && isOpen) {
      wrapped.push(state.createToken('html_block', '</section>\n'));
      isOpen = false;
    }
    const section = sections.get(index);
    if (section) {
      const label = escaped(state.rendering.sectionLabels[section]);
      const classes = `${CLASS_PREFIX}delta ${CLASS_PREFIX}delta-${section}`;
      wrapped.push(state.createToken('html_block', `<section class="${classes}" aria-label="${label}">\n`));
      isOpen = true;
    }
    wrapped.push(token);
  }
  if (isOpen) wrapped.push(state.createToken('html_block', '</section>\n'));
  state.tokens.splice(0, state.tokens.length, ...wrapped);
}

/**
 * Marks requirements and scenarios, and labels the delta sections of a spec delta, by the spec tool's
 * line rules. Roles in the outline come from these rules, never from classes the author wrote.
 */
export function specStructurePlugin(markdown: MarkdownIt): void {
  markdown.core.ruler.push('mdx_spec_structure', (core) => {
    const environment = core.env as SpecStructureEnvironment;
    const rendering = environment.specStructure;
    if (!rendering) return;
    const state: MarkingState = {
      lines: core.src.split('\n'),
      environment,
      rendering,
      tokens: core.tokens,
      createToken: tokenFactoryOf(core),
      isInRequirement: false,
    };
    const sections = new Map<number, DeltaSectionKind>();
    for (const [index, token] of core.tokens.entries()) {
      if (token.type !== 'heading_open') continue;
      const section = markHeading(state, index);
      if (section) sections.set(index, section);
    }
    wrapSections(state, sections);
  });
}
