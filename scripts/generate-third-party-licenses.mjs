// Writes the third-party licenses shown in About from the lockfiles' dependency trees.
// Run with `just licenses`; the release build runs it before bundling.
import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const OUTPUT = join(ROOT, 'apps', 'desktop', 'src', 'generated', 'third-party-licenses.json');
const CARGO_MANIFEST = 'apps/desktop/src-tauri/Cargo.toml';
const WINDOWS_TARGET = 'x86_64-pc-windows-msvc';
const OWN_PACKAGE = /^(@mdx\/|mdx-desktop$|mdx$)/;
const LICENSE_FILE = /^(licen[cs]e|copying|notice)/i;
const MAX_COMMAND_OUTPUT_BYTES = 268_435_456;

const COMMAND_OPTIONS = { cwd: ROOT, encoding: 'utf8', maxBuffer: MAX_COMMAND_OUTPUT_BYTES };

function licenseTextIn(folder) {
  let names;
  try {
    names = readdirSync(folder)
      .filter((name) => LICENSE_FILE.test(name))
      .sort();
  } catch {
    return undefined;
  }
  const texts = names.flatMap((name) => {
    try {
      return [readFileSync(join(folder, name), 'utf8').trim()];
    } catch {
      return [];
    }
  });
  return texts.length > 0 ? texts.join('\n\n') : undefined;
}

function npmPackages() {
  // pnpm is a script on Windows, so it runs through the shell; the command has no user input.
  const listing = JSON.parse(execSync('pnpm licenses list --json --prod --recursive', COMMAND_OPTIONS));
  return Object.values(listing)
    .flat()
    .filter((entry) => !OWN_PACKAGE.test(entry.name))
    .flatMap((entry) =>
      entry.versions.map((version, index) => ({
        ecosystem: 'npm',
        name: entry.name,
        version,
        license: entry.license,
        text: licenseTextIn(entry.paths[index] ?? entry.paths[0]),
      })),
    );
}

/** The crates compiled into the Windows app: normal dependencies only, no build or dev tools. */
function cargoPackages() {
  const metadata = JSON.parse(
    execFileSync(
      'cargo',
      [
        'metadata',
        '--format-version',
        '1',
        '--manifest-path',
        CARGO_MANIFEST,
        '--filter-platform',
        WINDOWS_TARGET,
      ],
      COMMAND_OPTIONS,
    ),
  );
  const packagesById = new Map(metadata.packages.map((cargoPackage) => [cargoPackage.id, cargoPackage]));
  const nodesById = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const reached = new Set();
  const toVisit = [metadata.resolve.root];
  while (toVisit.length > 0) {
    const id = toVisit.pop();
    if (reached.has(id)) continue;
    reached.add(id);
    for (const dependency of nodesById.get(id)?.deps ?? []) {
      const isNormal = dependency.dep_kinds.some((kind) => kind.kind === null);
      if (isNormal) toVisit.push(dependency.pkg);
    }
  }
  return [...reached]
    .map((id) => packagesById.get(id))
    .filter((cargoPackage) => cargoPackage && !OWN_PACKAGE.test(cargoPackage.name))
    .map((cargoPackage) => ({
      ecosystem: 'cargo',
      name: cargoPackage.name,
      version: cargoPackage.version,
      license: cargoPackage.license ?? 'see license text',
      text: licenseTextIn(dirname(cargoPackage.manifest_path)),
    }));
}

function withSharedTexts(packages) {
  const texts = [];
  const textIndexes = new Map();
  const entries = packages
    .sort(
      (first, second) => first.name.localeCompare(second.name) || first.version.localeCompare(second.version),
    )
    .map(({ text, ...entry }) => {
      if (text === undefined) return { ...entry, textIndex: null };
      if (!textIndexes.has(text)) {
        textIndexes.set(text, texts.length);
        texts.push(text);
      }
      return { ...entry, textIndex: textIndexes.get(text) };
    });
  return { packages: entries, texts };
}

const licenses = withSharedTexts([...npmPackages(), ...cargoPackages()]);
mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(licenses, null, 1)}\n`);
console.log(
  `Wrote ${String(licenses.packages.length)} packages and ${String(licenses.texts.length)} license texts.`,
);
