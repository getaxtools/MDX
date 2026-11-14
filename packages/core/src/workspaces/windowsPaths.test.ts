import { describe, expect, it } from 'vitest';
import { locationOfPath, relativePathFrom, resolvePathFrom } from './windowsPaths';

describe('Windows paths', () => {
  it('same-drive paths are relative with forward slashes', () => {
    expect(relativePathFrom('D:\\team', 'D:\\team\\docs')).toBe('docs');
    expect(relativePathFrom('D:\\team\\specs', 'd:\\Team\\docs\\guide.md')).toBe('../docs/guide.md');
    expect(relativePathFrom('D:\\team', 'D:\\team')).toBe('.');
  });

  it('paths on the same share are relative too', () => {
    expect(relativePathFrom('\\\\server\\share\\team', '\\\\SERVER\\share\\team\\docs')).toBe('docs');
  });

  it('paths on another drive or share have no relative form', () => {
    expect(relativePathFrom('D:\\team', 'E:\\shared')).toBeUndefined();
    expect(relativePathFrom('\\\\server\\share', '\\\\server\\other\\docs')).toBeUndefined();
    expect(relativePathFrom('D:\\team', 'relative\\path')).toBeUndefined();
  });

  it('relative paths resolve against the file folder', () => {
    expect(resolvePathFrom('D:\\team', 'docs')).toBe('D:\\team\\docs');
    expect(resolvePathFrom('D:\\team\\specs', '../docs/guide.md')).toBe('D:\\team\\docs\\guide.md');
    expect(resolvePathFrom('D:\\team', './a/./b')).toBe('D:\\team\\a\\b');
  });

  it('absolute written paths are kept, with backslashes', () => {
    expect(resolvePathFrom('D:\\team', 'E:/shared/notes')).toBe('E:\\shared\\notes');
    expect(resolvePathFrom('D:\\team', '\\\\server\\share\\docs')).toBe('\\\\server\\share\\docs');
  });

  it('never climbs above the drive root', () => {
    expect(resolvePathFrom('D:\\team', '../../../x')).toBe('D:\\x');
  });

  it('keys a location as the desktop app does', () => {
    expect(locationOfPath('D:\\Team\\Guide.md')).toEqual({
      canonicalKey: 'd:\\team\\guide.md',
      displayPath: 'D:\\Team\\Guide.md',
      fileName: 'Guide.md',
    });
  });
});
