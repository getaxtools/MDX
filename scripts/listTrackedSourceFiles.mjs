import { execFileSync } from 'node:child_process';

const SOURCE_EXTENSIONS = /\.(ts|svelte|rs|mjs|js)$/;
const SOURCE_ROOTS = /^(packages|apps|tests|scripts)\//;

export function listTrackedSourceFiles() {
  const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
  });
  return output
    .split('\0')
    .filter(
      (file) => SOURCE_ROOTS.test(file) && SOURCE_EXTENSIONS.test(file) && !file.includes('/fixtures/'),
    );
}
