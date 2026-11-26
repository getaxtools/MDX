import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DocumentFixture {
  readonly name: string;
  readonly bytes: Uint8Array;
}

const FIXTURES_FOLDER = join(import.meta.dirname, '..', '..', '..', '..', 'tests', 'fixtures');
/** The documents the desktop UI tests open, and the exact-bytes documents kept out of their folder. */
const DOCUMENT_FIXTURE_FOLDERS = ['documents', 'byte-exact'];

export const BYTE_EXACT_FIXTURES_FOLDER = join(FIXTURES_FOLDER, 'byte-exact');

/** Every Markdown document fixture, read as bytes so byte order marks and line breaks are as on disk. */
export function documentFixtures(): readonly DocumentFixture[] {
  return DOCUMENT_FIXTURE_FOLDERS.flatMap((folder) => {
    const folderPath = join(FIXTURES_FOLDER, folder);
    return readdirSync(folderPath)
      .filter((fileName) => fileName.endsWith('.md'))
      .map((fileName) => ({
        name: `${folder}/${fileName}`,
        bytes: new Uint8Array(readFileSync(join(folderPath, fileName))),
      }));
  });
}
