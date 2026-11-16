import type { ReferenceDefinitionSegment } from '../DocumentStructure';
import { numberParameter, severityParameter, type InjectionRule, type Ruleset } from '../Ruleset';
import type { DocumentRuleInput, RuleMatch } from './RuleMatch';

const HTML_COMMENT_RULE_ID = 'hidden-html-comment';
const MARKDOWN_COMMENT_RULE_ID = 'hidden-markdown-comment';
const WORD = /[\p{L}\p{N}]+/gu;
const LETTER = /^\p{L}$/u;

export function wordCountOf(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

function severityForWords(rule: InjectionRule, text: string) {
  return wordCountOf(text) >= numberParameter(rule, 'longCommentWords')
    ? severityParameter(rule, 'longCommentSeverity')
    : rule.severity;
}

function startsWithMarker(marker: string, prefix: string): boolean {
  if (!marker.startsWith(prefix)) return false;
  const isLetterEnding = LETTER.test(prefix.at(-1) ?? '');
  return !isLetterEnding || !LETTER.test(marker.charAt(prefix.length));
}

/** Short comments that tools write, such as `<!-- toc -->`; a long comment is never a marker, whatever it starts with. */
function isToolMarker(rule: InjectionRule, ruleset: Ruleset, content: string): boolean {
  const marker = content.trim().toLowerCase();
  if (wordCountOf(marker) > numberParameter(rule, 'maxToolMarkerWords')) return false;
  return ruleset.list('commentMarkerPrefixes').some((prefix) => startsWithMarker(marker, prefix));
}

export function findHiddenHtmlComments(input: DocumentRuleInput): RuleMatch[] {
  const rule = input.ruleset.rule(HTML_COMMENT_RULE_ID);
  return input.html.comments.flatMap((comment) => {
    if (comment.content.trim() === '' || isToolMarker(rule, input.ruleset, comment.content)) return [];
    const words = wordCountOf(comment.content);
    return [
      {
        ruleId: HTML_COMMENT_RULE_ID,
        from: comment.from,
        to: comment.to,
        severity: severityForWords(rule, comment.content),
        messageArguments: { words },
      },
    ];
  });
}

/** The `[//]: # (text)` idiom and its variants: a definition no link uses, written to hold a comment. */
export function isMarkdownComment(ruleset: Ruleset, definition: ReferenceDefinitionSegment): boolean {
  if (definition.isUsed) return false;
  const labels = ruleset.list('markdownCommentLabels').map((label) => label.toLowerCase());
  const destinations = ruleset.list('markdownCommentDestinations');
  const destination = definition.destination === '' ? '<>' : definition.destination;
  return labels.includes(definition.label.toLowerCase()) || destinations.includes(destination);
}

export function findHiddenMarkdownComments(input: DocumentRuleInput): RuleMatch[] {
  const rule = input.ruleset.rule(MARKDOWN_COMMENT_RULE_ID);
  return input.structure.segments.flatMap((segment) => {
    if (segment.kind !== 'referenceDefinition' || !isMarkdownComment(input.ruleset, segment)) return [];
    const comment = segment.title ?? '';
    return [
      {
        ruleId: MARKDOWN_COMMENT_RULE_ID,
        ...segment.range,
        severity: severityForWords(rule, comment),
        messageArguments: { words: wordCountOf(comment) },
      },
    ];
  });
}
