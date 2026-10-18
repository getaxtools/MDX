import { describe, expect, it } from 'vitest';
import { splitFrontMatter } from './splitFrontMatter';

describe('splitFrontMatter', () => {
  it('separates YAML front matter from the body', () => {
    const result = splitFrontMatter('---\ntitle: Guide\n---\n# Guide');

    expect(result).toEqual({ frontMatter: 'title: Guide', body: '# Guide' });
  });

  it('accepts the YAML end marker "..."', () => {
    expect(splitFrontMatter('---\ntitle: Guide\n...\nBody').frontMatter).toBe('title: Guide');
  });

  it('separates TOML front matter', () => {
    expect(splitFrontMatter('+++\ntitle = "Guide"\n+++\nBody')).toEqual({
      frontMatter: 'title = "Guide"',
      body: 'Body',
    });
  });

  it('handles Windows line endings', () => {
    expect(splitFrontMatter('---\r\ntitle: Guide\r\n---\r\nBody')).toEqual({
      frontMatter: 'title: Guide',
      body: 'Body',
    });
  });

  it('leaves a document without front matter unchanged', () => {
    expect(splitFrontMatter('# Guide\n---\n')).toEqual({ body: '# Guide\n---\n' });
  });

  it('leaves an unclosed front matter block in the body', () => {
    expect(splitFrontMatter('---\ntitle: Guide')).toEqual({ body: '---\ntitle: Guide' });
  });
});
