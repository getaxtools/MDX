import { CodePointSet } from '../CodePointSet';
import { decodeTagCharacters } from '../decoders/decodeTagCharacters';
import { findCharacterReferences, type CharacterReference } from '../decoders/decodeCharacterReferences';
import { severityParameter } from '../Ruleset';
import type { CharacterRuleInput, RuleMatch } from './RuleMatch';
import { hiddenCharactersOf } from './scanHiddenCharacters';

const RULE_ID = 'char-encoded-invisible';

function adjacentReferenceRuns(references: readonly CharacterReference[]): CharacterReference[][] {
  const runs: CharacterReference[][] = [];
  for (const reference of references) {
    const run = runs.at(-1);
    if (run && run.at(-1)?.to === reference.from) run.push(reference);
    else runs.push([reference]);
  }
  return runs;
}

/** References in code spans and code blocks are shown as written, so only those the page decodes count. */
export function findEncodedInvisibleCharacters(input: CharacterRuleInput): RuleMatch[] {
  const rule = input.ruleset.rule(RULE_ID);
  const hiddenCharacters = hiddenCharactersOf(input.ruleset);
  const tagOrBidi = CodePointSet.union(
    ['tagCharacters', 'bidiControls', 'bidiMarks'].map((name) => input.ruleset.codepointSet(name)),
  );
  const hiddenReferences = findCharacterReferences(input.text).filter(
    (reference) => hiddenCharacters.has(reference.codePoint) && !input.structure.isInCode(reference.from),
  );
  return adjacentReferenceRuns(hiddenReferences).map((run) => {
    const codePoints = run.map((reference) => reference.codePoint);
    const isTagOrBidi = codePoints.some((codePoint) => tagOrBidi.has(codePoint));
    const decoded = decodeTagCharacters(
      codePoints.map((codePoint) => String.fromCodePoint(codePoint)).join(''),
    );
    return {
      ruleId: RULE_ID,
      from: run[0]?.from ?? 0,
      to: run.at(-1)?.to ?? 0,
      severity: isTagOrBidi ? severityParameter(rule, 'tagOrBidiSeverity') : rule.severity,
      ...(decoded === '' ? {} : { decoded }),
      messageArguments: { count: run.length },
    };
  });
}
