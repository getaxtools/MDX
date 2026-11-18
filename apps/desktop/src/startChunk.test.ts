import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPOSITORY = resolve(import.meta.dirname, '..', '..', '..');
/** What the window loads before the first document shows: the entry and the viewer it starts. */
const START_MODULES = ['apps/desktop/src/main.ts', 'apps/desktop/src/startViewerApp.ts'];
/** Code that loads on first use only, in chunks of its own. */
const LAZY_CODE = [
  /^packages\/editor\/src\/rich-text\//,
  /^packages\/editor\/src\/formulas\//,
  /^packages\/editor\/src\/formula-paste\//,
  /^packages\/editor\/src\/createSourceEditor\.ts$/,
  /^packages\/ui\/src\/features\/equation\/(EquationDialog|TemplateGallery|equationTemplates|supportedTexCommands|texCommands|visual\/)/,
  /^@codemirror\//,
  /^@lezer\//,
  /^mathlive$/,
  /^mathml-to-latex$/,
];
const MODULE_EXTENSIONS = ['', '.ts', '.svelte', '.js', '/index.ts'];
/** `import x from 'y'`, `export { x } from 'y'` and `import 'y'`, leaving out type-only imports. */
const STATIC_IMPORT = /^\s*(?:import|export)\s+(?!type\s)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;

function packageEntries(packageName: string): Readonly<Record<string, string>> {
  const manifest = JSON.parse(
    readFileSync(join(REPOSITORY, 'packages', packageName, 'package.json'), 'utf8'),
  ) as { exports: Record<string, string | { default: string }> };
  return Object.fromEntries(
    Object.entries(manifest.exports).map(([subpath, target]) => [
      subpath,
      join('packages', packageName, typeof target === 'string' ? target : target.default),
    ]),
  );
}

function repositoryPath(absolute: string): string {
  return relative(REPOSITORY, absolute).split(sep).join('/');
}

/** A module's path in the repository, or the bare name of a dependency outside it. */
function resolved(specifier: string, importer: string): string {
  const workspacePackage = /^@mdx\/([^/]+)(\/.*)?$/.exec(specifier);
  if (workspacePackage) {
    const entry = packageEntries(workspacePackage[1] ?? '')[`.${workspacePackage[2] ?? ''}`];
    if (!entry) throw new Error(`${specifier} is not exported`);
    return repositoryPath(join(REPOSITORY, entry));
  }
  if (!specifier.startsWith('.')) return specifier;
  // A query such as `?inline` or `?worker` brings in text or a separate file, not code to follow.
  const [path = '', query] = specifier.split('?');
  if (query !== undefined) return `${repositoryPath(join(REPOSITORY, dirname(importer), path))}?${query}`;
  const base = join(REPOSITORY, dirname(importer), specifier);
  const found = MODULE_EXTENSIONS.map((extension) => `${base}${extension}`).find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
  if (!found) throw new Error(`Cannot find ${specifier} from ${importer}`);
  return repositoryPath(found);
}

function staticImportsOf(path: string): string[] {
  const source = readFileSync(join(REPOSITORY, path), 'utf8');
  const code = path.endsWith('.svelte')
    ? [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join('\n')
    : source;
  return [...code.matchAll(STATIC_IMPORT)].map((match) => resolved(match[1] ?? '', path));
}

/** Every module the start modules reach without a dynamic `import()`. */
function startGraph(): Set<string> {
  const reached = new Set<string>();
  const waiting = [...START_MODULES];
  for (let path = waiting.pop(); path !== undefined; path = waiting.pop()) {
    if (reached.has(path)) continue;
    reached.add(path);
    const isInRepository = path.includes('/') && existsSync(join(REPOSITORY, path));
    if (isInRepository && /\.(ts|svelte)$/.test(path)) waiting.push(...staticImportsOf(path));
  }
  return reached;
}

describe('the start chunk', () => {
  it('the start chunk contains no Rich text, equation or paste code', () => {
    const graph = startGraph();

    expect([...graph].filter((path) => LAZY_CODE.some((pattern) => pattern.test(path)))).toEqual([]);
    expect(graph.has('packages/ui/src/features/viewer/ViewerApp.svelte')).toBe(true);
  });
});
