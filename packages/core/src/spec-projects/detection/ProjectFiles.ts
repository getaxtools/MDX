import type { SpecProjectManifest } from '@mdx/platform';

/** The manifest seen from one project folder: paths relative to it, compared in any case. */
export class ProjectFiles {
  private readonly folderKeys: ReadonlySet<string>;
  private readonly textByFileKey: ReadonlyMap<string, string | null>;

  constructor(
    readonly folders: readonly string[],
    readonly files: readonly { readonly path: string; readonly text: string | null }[],
  ) {
    this.folderKeys = new Set(
      [...folders, ...files.flatMap((file) => parentFoldersOf(file.path))].map(keyOf),
    );
    this.textByFileKey = new Map(files.map((file) => [keyOf(file.path), file.text]));
  }

  static of(manifest: SpecProjectManifest, projectFolder: string): ProjectFiles {
    const prefix = projectFolder === '' ? '' : `${keyOf(projectFolder)}/`;
    const inside = (path: string) => keyOf(path).startsWith(prefix);
    const relative = (path: string) => path.slice(prefix.length);
    return new ProjectFiles(
      manifest.folders.filter(inside).map(relative),
      manifest.files
        .filter((file) => inside(file.path))
        .map((file) => ({ ...file, path: relative(file.path) })),
    );
  }

  hasFolder(folder: string): boolean {
    return this.folderKeys.has(keyOf(folder));
  }

  hasFile(path: string): boolean {
    return this.textByFileKey.has(keyOf(path));
  }

  textOf(path: string): string | undefined {
    return this.textByFileKey.get(keyOf(path)) ?? undefined;
  }

  /** The names of the folders directly inside a folder. */
  subfolderNamesOf(folder: string): string[] {
    const prefix = `${keyOf(folder)}/`;
    const names = [...this.folders, ...this.files.flatMap((file) => parentFoldersOf(file.path))]
      .filter((path) => keyOf(path).startsWith(prefix))
      .map((path) => path.slice(prefix.length).split('/')[0] ?? '');
    return uniqueInAnyCase(names);
  }

  /** The paths of the files at any depth below a folder. */
  filesBelow(folder: string): string[] {
    const prefix = `${keyOf(folder)}/`;
    return this.files.map((file) => file.path).filter((path) => keyOf(path).startsWith(prefix));
  }

  /** The paths of the files directly inside a folder. */
  filesDirectlyIn(folder: string): string[] {
    const prefix = `${keyOf(folder)}/`;
    return this.files
      .map((file) => file.path)
      .filter((path) => keyOf(path).startsWith(prefix) && !path.slice(prefix.length).includes('/'));
  }
}

export function keyOf(path: string): string {
  return path.toLowerCase();
}

function parentFoldersOf(path: string): string[] {
  const parts = path.split('/').slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}

export function uniqueInAnyCase(names: readonly string[]): string[] {
  const byKey = new Map(names.filter((name) => name !== '').map((name) => [keyOf(name), name]));
  return [...byKey.values()].sort((first, second) => first.localeCompare(second));
}
