import { readFileSync } from 'node:fs';
import { listTrackedSourceFiles } from './listTrackedSourceFiles.mjs';

const TEXT_BETWEEN_TAGS = />\s*([^<>{}\s][^<>{}]*?)\s*</g;
const LITERAL_ACCESSIBLE_ATTRIBUTE = /\b(aria-label|title|placeholder|alt)="([^"{][^"]*)"/g;
const HAS_LETTER = /\p{L}/u;

function findHardCodedText(file) {
  const markup = readFileSync(file, 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
  const textNodes = [...markup.matchAll(TEXT_BETWEEN_TAGS)].map((match) => match[1]);
  const attributes = [...markup.matchAll(LITERAL_ACCESSIBLE_ATTRIBUTE)].map((match) => match[2]);
  return [...textNodes, ...attributes]
    .filter((text) => HAS_LETTER.test(text))
    .map((text) => `${file}: hard-coded UI text "${text.trim()}", use a message key`);
}

const problems = listTrackedSourceFiles()
  .filter((file) => file.endsWith('.svelte'))
  .flatMap(findHardCodedText);

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
