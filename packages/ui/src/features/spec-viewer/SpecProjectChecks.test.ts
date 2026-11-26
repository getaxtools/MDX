import { describe, expect, it, vi } from 'vitest';
import type { ProjectFile, ProjectFileSummary } from '../prompt-injection/InjectionChecker';
import { SpecProjectChecks } from './SpecProjectChecks';

const ROOT = { canonicalKey: 'c:\\projects\\shop', displayPath: 'C:\\Projects\\shop', fileName: 'shop' };

/** Finds two findings in each file whose text says so, and none in the others. */
function fakeChecker() {
  const checked: string[] = [];
  return {
    checked,
    checkDocuments: async (files: readonly ProjectFile[]): Promise<ProjectFileSummary[]> => {
      const summaries: ProjectFileSummary[] = [];
      for (const file of files) {
        checked.push(file.location);
        const isSuspicious = (await file.readText()).includes('hidden');
        summaries.push(
          isSuspicious
            ? { location: file.location, findingCount: 2, highestSeverity: 'high' }
            : { location: file.location, findingCount: 0 },
        );
      }
      return summaries;
    },
    cancel: vi.fn(),
  };
}

describe('SpecProjectChecks', () => {
  it('keeps the findings of each Markdown document that has any, by its full path', async () => {
    const checker = fakeChecker();
    const texts: Record<string, string> = { 'GEMINI.md': 'hidden', 'openspec/specs/tabs/spec.md': '# tabs' };
    const onChange = vi.fn();
    const checks = new SpecProjectChecks({
      checker,
      ignoreEntries: () => [],
      onChange,
    });

    await checks.check([
      {
        root: ROOT,
        paths: ['GEMINI.md', 'openspec/specs/tabs/spec.md', 'openspec/config.yaml'],
        readText: (path) => Promise.resolve(texts[path]),
      },
    ]);

    expect([...checks.findings()]).toEqual([
      [
        'C:\\Projects\\shop\\GEMINI.md',
        { location: 'c:\\projects\\shop\\gemini.md', findingCount: 2, highestSeverity: 'high' },
      ],
    ]);
    expect(checker.checked).toEqual([
      'c:\\projects\\shop\\gemini.md',
      'c:\\projects\\shop\\openspec\\specs\\tabs\\spec.md',
    ]);
    expect(onChange).toHaveBeenCalledOnce();
  });
});
