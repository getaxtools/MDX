import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AGENT_INSTRUCTION_LOCATIONS,
  isAgentInstructionFile,
  MAX_NESTED_INSTRUCTION_LEVELS,
} from './agentInstructionLocations';

const temporaryFolders: string[] = [];

afterEach(() => {
  for (const folder of temporaryFolders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function examplePathFor(location: string): string {
  return location
    .split('/')
    .map((part) => (part === '**' ? 'nested' : part.replaceAll('*', 'example')))
    .join('/');
}

/** Agent instruction files are never committed, so each test writes its own into a temporary folder. */
function projectFolderWith(relativePaths: readonly string[]): string {
  const folder = mkdtempSync(join(tmpdir(), 'mdx-agent-files-'));
  temporaryFolders.push(folder);
  for (const relativePath of relativePaths) {
    const path = join(folder, ...relativePath.split('/'));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '# Instructions');
  }
  return folder;
}

function filesBelow(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .slice(folder.length + 1)
        .replaceAll('\\', '/'),
    )
    .sort();
}

describe('agent instruction locations', () => {
  it('detects a file written at each location', () => {
    const examplePaths = AGENT_INSTRUCTION_LOCATIONS.map(examplePathFor);
    const folder = projectFolderWith(examplePaths);

    const detected = filesBelow(folder).filter(isAgentInstructionFile);

    expect(detected).toEqual([...examplePaths].sort());
  });

  it(`finds a nested project instruction file up to ${String(MAX_NESTED_INSTRUCTION_LEVELS)} levels down, not deeper`, () => {
    const projectFileName = AGENT_INSTRUCTION_LOCATIONS[0] ?? '';
    const folder = projectFolderWith([
      `packages/api/${projectFileName}`,
      `a/b/c/d/${projectFileName}`,
      `a/b/c/d/e/${projectFileName}`,
    ]);

    const detected = filesBelow(folder).filter(isAgentInstructionFile);

    expect(detected).toEqual([`a/b/c/d/${projectFileName}`, `packages/api/${projectFileName}`]);
  });

  it('does not detect other files next to them', () => {
    const folder = projectFolderWith([
      'README.md',
      '.github/workflows/ci.md',
      '.cursor/notes.md',
      'src/GEMINI.txt',
    ]);

    expect(filesBelow(folder).filter(isAgentInstructionFile)).toEqual([]);
  });
});
