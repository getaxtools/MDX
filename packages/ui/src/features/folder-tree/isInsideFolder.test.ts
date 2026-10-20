import { describe, expect, it } from 'vitest';
import { isInsideFolder } from './isInsideFolder';

describe('isInsideFolder', () => {
  it.each([
    ['c:\\docs\\guide.md', 'c:\\docs', true],
    ['c:\\docs\\specs\\plan.md', 'c:\\docs', true],
    ['/home/ana/docs/guide.md', '/home/ana/docs', true],
    ['c:\\docs-old\\guide.md', 'c:\\docs', false],
    ['c:\\docs', 'c:\\docs', false],
    ['d:\\docs\\guide.md', 'c:\\docs', false],
  ])('%s inside %s is %s', (canonicalKey, folderKey, expected) => {
    expect(isInsideFolder(canonicalKey, folderKey)).toBe(expected);
  });
});
