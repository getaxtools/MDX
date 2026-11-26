import { describe, expect, it } from 'vitest';
import { shouldCheckAutomatically } from './shouldCheckAutomatically';

const README = { origin: 'local', location: 'C:\\docs\\README.md' } as const;
const AGENT_FILE = { origin: 'local', location: 'C:\\project\\.cursorrules' } as const;
const REMOTE_COPY = { origin: 'remote', location: 'https://example.com/guide.md' } as const;
const SPEC_FILE = { origin: 'local', location: 'C:\\specs\\notes.md', isAgentContext: true } as const;

describe('shouldCheckAutomatically', () => {
  it('checks agent files, remote copies and spec project files by default, but not a normal README', () => {
    expect(shouldCheckAutomatically(AGENT_FILE, 'agentContext')).toBe(true);
    expect(shouldCheckAutomatically(REMOTE_COPY, 'agentContext')).toBe(true);
    expect(shouldCheckAutomatically(SPEC_FILE, 'agentContext')).toBe(true);
    expect(shouldCheckAutomatically(README, 'agentContext')).toBe(false);
  });

  it('checks every document when set to all documents', () => {
    expect(shouldCheckAutomatically(README, 'allDocuments')).toBe(true);
    expect(shouldCheckAutomatically({ origin: 'untitled' }, 'allDocuments')).toBe(true);
  });

  it('checks nothing by itself when turned off', () => {
    expect(shouldCheckAutomatically(AGENT_FILE, 'off')).toBe(false);
    expect(shouldCheckAutomatically(REMOTE_COPY, 'off')).toBe(false);
  });
});
