import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface FileAssociation {
  readonly ext: readonly string[];
  readonly role: string;
}

const configuration = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'src-tauri', 'tauri.conf.json'), 'utf8'),
) as { readonly bundle: { readonly fileAssociations: readonly FileAssociation[] } };

const extensionsFor = (role: string) =>
  configuration.bundle.fileAssociations
    .filter((association) => association.role === role)
    .flatMap((association) => association.ext);

describe('file associations', () => {
  it('opens Markdown documents for viewing', () => {
    expect(extensionsFor('Viewer')).toEqual(['md', 'markdown', 'mdown', 'mkd', 'mdx']);
  });

  it('registers the workspace file type, which opens with a confirmation', () => {
    expect(extensionsFor('Editor')).toEqual(['mdxworkspace']);
  });
});
