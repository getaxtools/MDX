import { matchesLocationPattern } from '../scan/matchesLocationPattern';

/** How deep below the project folder a nested project instruction file is still found. */
export const MAX_NESTED_INSTRUCTION_LEVELS = 4;

function atRootAndNested(fileName: string): string[] {
  return Array.from({ length: MAX_NESTED_INSTRUCTION_LEVELS + 1 }, (_, levels) =>
    [...Array.from({ length: levels }, () => '*'), fileName].join('/'),
  );
}

/**
 * Where coding assistants read their instructions, as scan locations relative to a project folder.
 * The project scan is given this list, so it is the one place these names are written.
 */
export const AGENT_INSTRUCTION_LOCATIONS: readonly string[] = [
  ...atRootAndNested('AGENTS.md'),
  'CLAUDE.md',
  'CLAUDE.local.md',
  '.claude/CLAUDE.md',
  '.claude/rules/**/*.md',
  '.claude/skills/*/SKILL.md',
  '.claude/agents/*.md',
  '.claude/commands/*.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  '.github/instructions/**/*.instructions.md',
  '.cursor/rules/**/*.mdc',
  '.cursorrules',
  '.windsurf/rules/*.md',
  '.kiro/steering/*.md',
  '.specify/memory/constitution.md',
  'openspec/config.yaml',
  'openspec/config.yml',
];

export function isAgentInstructionFile(relativePath: string): boolean {
  return AGENT_INSTRUCTION_LOCATIONS.some((location) => matchesLocationPattern(location, relativePath));
}
