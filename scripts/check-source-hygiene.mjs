import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { listTrackedSourceFiles } from './listTrackedSourceFiles.mjs';

const GENERIC_MODULE_NAMES = new Set([
  'utils',
  'util',
  'helpers',
  'helper',
  'common',
  'misc',
  'manager',
  'stuff',
]);
const TODO_WITHOUT_ISSUE = /\b(TODO|FIXME|XXX)\b(?!\(#\d+\))/;
const THIS_SCRIPT = 'scripts/check-source-hygiene.mjs';

function findGenericModuleName(file) {
  const name = basename(file, extname(file))
    .replace(/\.test$/, '')
    .toLowerCase();
  return GENERIC_MODULE_NAMES.has(name)
    ? [`${file}: generic module name "${name}", name it after what it does`]
    : [];
}

function findTodosWithoutIssue(file) {
  if (file === THIS_SCRIPT) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line, index) =>
      TODO_WITHOUT_ISSUE.test(line)
        ? [`${file}:${index + 1}: TODO needs an issue number, e.g. TODO(#42)`]
        : [],
    );
}

const problems = listTrackedSourceFiles().flatMap((file) => [
  ...findGenericModuleName(file),
  ...findTodosWithoutIssue(file),
]);

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
