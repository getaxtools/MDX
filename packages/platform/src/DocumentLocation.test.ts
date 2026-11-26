import { describe, expect, it } from 'vitest';
import {
  hasFile,
  isUntitledLocation,
  isViewLocation,
  untitledLocation,
  viewLocation,
} from './DocumentLocation';

describe('document locations', () => {
  it('a view location is keyed by its view, not by a path', () => {
    const view = viewLocation('spec-dashboard:c:\\projects\\shop|', 'Dashboard - shop');

    expect(view).toEqual({
      canonicalKey: 'view:spec-dashboard:c:\\projects\\shop|',
      displayPath: 'Dashboard - shop',
      fileName: 'Dashboard - shop',
    });
    expect(isViewLocation(view)).toBe(true);
    expect(isUntitledLocation(view)).toBe(false);
  });

  it('only a location of a file on disk has a file', () => {
    const file = {
      canonicalKey: 'c:\\docs\\guide.md',
      displayPath: 'C:\\Docs\\Guide.md',
      fileName: 'Guide.md',
    };

    expect(hasFile(file)).toBe(true);
    expect(hasFile(untitledLocation(1, 'Untitled-1.md'))).toBe(false);
    expect(hasFile(viewLocation('dashboard', 'Dashboard'))).toBe(false);
  });
});
