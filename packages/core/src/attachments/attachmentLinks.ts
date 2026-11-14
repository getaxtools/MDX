/** Characters a Markdown link target cannot hold as they are; other characters, such as `é`, stay. */
const CHARACTERS_TO_ENCODE = /[ ()<>#%]/g;
const FILE_EXTENSION = /\.[^./\\]+$/;
const NAME_SEPARATORS = /[-_]+/g;
const TWO_DIGITS = 2;
const HEXADECIMAL = 16;

/** A relative link target with forward slashes, encoded only where Markdown needs it. */
export function attachmentLinkTarget(relativePath: string): string {
  return relativePath
    .replaceAll('\\', '/')
    .replace(
      CHARACTERS_TO_ENCODE,
      (character) => `%${character.charCodeAt(0).toString(HEXADECIMAL).toUpperCase()}`,
    );
}

/** Alt text read from the file name: `team-photo_2.png` gives `team photo 2`. */
export function altTextOf(fileName: string): string {
  return fileName.replace(FILE_EXTENSION, '').replace(NAME_SEPARATORS, ' ').trim();
}

export function imageMarkdown(relativePath: string): string {
  const fileName = relativePath.split('/').at(-1) ?? relativePath;
  return `![${altTextOf(fileName)}](${attachmentLinkTarget(relativePath)})`;
}

/** A pasted picture has no name, so it is named after the document and the local time. */
export function pastedImageName(documentFileName: string, now: Date): string {
  const documentName = documentFileName.replace(FILE_EXTENSION, '');
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(twoDigits).join('-');
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map(twoDigits).join('-');
  return `${documentName} ${date} ${time}.png`;
}

function twoDigits(value: number): string {
  return String(value).padStart(TWO_DIGITS, '0');
}
