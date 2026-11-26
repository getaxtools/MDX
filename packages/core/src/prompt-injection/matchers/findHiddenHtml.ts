import type { HiddenHtmlContent, HtmlHidingReason } from '../html/analyzeHtml';
import { hasReadableText, type DocumentRuleInput, type RuleMatch } from './RuleMatch';

const RULE_OF_REASON: Readonly<Record<HtmlHidingReason, string>> = {
  style: 'hidden-css',
  hiddenAttribute: 'hidden-attribute',
  ariaHidden: 'hidden-attribute',
  fontColor: 'hidden-attribute',
  removedElement: 'hidden-removed-element',
  collapsedDetails: 'hidden-collapsed-details',
};
const REMOVED_LINK_RULE_ID = 'hidden-removed-element';

function matchOf(input: DocumentRuleInput, hidden: HiddenHtmlContent): RuleMatch {
  const ruleId = RULE_OF_REASON[hidden.reason];
  return {
    ruleId,
    ...hidden.element,
    severity: input.ruleset.rule(ruleId).severity,
    messageArguments: { name: hidden.tagName },
  };
}

/** HTML that hides its text by style, attribute, colour, collapsing or an element the sanitizer empties. */
export function findHiddenHtml(input: DocumentRuleInput): RuleMatch[] {
  const hiddenWithText = input.html.hiddenContents.filter((hidden) =>
    hasReadableText(input.text.slice(hidden.content.from, hidden.content.to)),
  );
  const removedLinks = input.html.unsafeLinks.map((link) => ({
    ruleId: REMOVED_LINK_RULE_ID,
    ...link,
    severity: input.ruleset.rule(REMOVED_LINK_RULE_ID).severity,
    messageArguments: { name: 'a' },
  }));
  return [...hiddenWithText.map((hidden) => matchOf(input, hidden)), ...removedLinks];
}
