import { matchesLocationPattern } from '../scan/matchesLocationPattern';

/**
 * Where coding assistants read their instructions, as scan locations relative to a project folder.
 * The project scan is given this list, so it is the one place these names are written.
 */
export const AGENT_INSTRUCTION_LOCATIONS: readonly string[] = [
  'CLAUDE.local.md',
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
