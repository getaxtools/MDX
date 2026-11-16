import type { Ruleset } from './Ruleset';

const WEB_ADDRESS = /^[a-z][a-z\d+.-]*:\/\//i;
const compiledPatterns = new WeakMap<Ruleset, readonly RegExp[]>();

function agentPathPatternsOf(ruleset: Ruleset): readonly RegExp[] {
  let patterns = compiledPatterns.get(ruleset);
  if (!patterns) {
    patterns = ruleset.list('agentPathPatterns').map((pattern) => new RegExp(pattern, 'iu'));
    compiledPatterns.set(ruleset, patterns);
  }
  return patterns;
}

function pathOf(location: string): string {
  if (WEB_ADDRESS.test(location) && URL.canParse(location))
    return decodeURIComponent(new URL(location).pathname);
  return location.replaceAll('\\', '/');
}

/** Whether a canonical path or web address names an agent instruction, rules, skills or spec file. */
export function isAgentFileLocation(location: string | undefined, ruleset: Ruleset): boolean {
  if (location === undefined || location === '') return false;
  const path = pathOf(location);
  return agentPathPatternsOf(ruleset).some((pattern) => pattern.test(path));
}
