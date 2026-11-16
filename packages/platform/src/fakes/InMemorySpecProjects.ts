import type { LineEnding, OpenedDocument } from '../DocumentFilePort';
import { DocumentOpenError } from '../DocumentOpenError';
import {
  MAX_SCANNED_SPEC_FILES,
  type SpecProjectFile,
  type SpecProjectLink,
  type SpecProjectManifest,
  type SpecProjectPort,
} from '../SpecProjectPort';
import { InMemoryDocumentFiles } from './InMemoryDocumentFiles';

export interface InMemorySpecProject {
  /** File texts by path relative to the root, with `/` between parts. */
  readonly files: Readonly<Record<string, string>>;
  /** Folders that hold no file, such as an empty `openspec/specs`. */
  readonly emptyFolders?: readonly string[];
  readonly links?: readonly SpecProjectLink[];
}

interface StoredFile {
  readonly text: string;
  readonly modifiedAtMs: number;
}

const CONFIGURATION_FILE = /\.(?:ya?ml|json)$/i;

function lineEndingOf(text: string): LineEnding {
  const windowsBreaks = text.split('\r\n').length - 1;
  const unixBreaks = text.split('\n').length - 1 - windowsBreaks;
  if (windowsBreaks > 0 && unixBreaks > 0) return 'mixed';
  return windowsBreaks > 0 ? 'crlf' : 'lf';
}

function parentFoldersOf(path: string): string[] {
  const parts = path.split('/').slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}

/** Spec projects in memory; a scan lists every file of a project, as if each were in a spec location. */
export class InMemorySpecProjects implements SpecProjectPort {
  /** At most this many files are listed, as the real scan stops at its limit. */
  maxScannedFiles = MAX_SCANNED_SPEC_FILES;
  /** Every file read, as `<root>|<relative path>`, so tests can tell an unchanged file was not read again. */
  readonly readFiles: string[] = [];
  private readonly projects = new Map<string, Map<string, StoredFile>>();
  private readonly emptyFolders = new Map<string, readonly string[]>();
  private readonly links = new Map<string, readonly SpecProjectLink[]>();
  private writeCount = 0;

  constructor(projects: Readonly<Record<string, InMemorySpecProject>> = {}) {
    for (const [root, project] of Object.entries(projects)) {
      this.projects.set(root, new Map());
      this.emptyFolders.set(root, project.emptyFolders ?? []);
      this.links.set(root, project.links ?? []);
      for (const [path, text] of Object.entries(project.files)) this.writeFile(root, path, text);
    }
  }

  /** Writes a file as another program would, which also moves its modified time on. */
  writeFile(root: string, relativePath: string, text: string): void {
    this.writeCount += 1;
    const files = this.projects.get(root) ?? new Map<string, StoredFile>();
    files.set(relativePath, { text, modifiedAtMs: this.writeCount });
    this.projects.set(root, files);
  }

  removeFile(root: string, relativePath: string): void {
    this.projects.get(root)?.delete(relativePath);
  }

  scanProject(root: string): Promise<SpecProjectManifest> {
    const files = this.projects.get(root);
    if (files === undefined) return Promise.reject(new DocumentOpenError('accessDenied', root));
    const paths = [...files.keys()].sort();
    const listed = paths.slice(0, this.maxScannedFiles);
    const folders = new Set([...listed.flatMap(parentFoldersOf), ...(this.emptyFolders.get(root) ?? [])]);
    return Promise.resolve({
      root: InMemoryDocumentFiles.locationOf(root),
      folders: [...folders].sort(),
      files: listed.map((path) => this.manifestFileOf(path, files)),
      links: this.links.get(root) ?? [],
      isIncomplete: paths.length > listed.length,
    });
  }

  readProjectFile(root: string, relativePath: string): Promise<OpenedDocument> {
    const files = this.projects.get(root);
    if (files === undefined) return Promise.reject(new DocumentOpenError('accessDenied', root));
    if (relativePath.split(/[\\/]/).includes('..')) {
      return Promise.reject(new DocumentOpenError('invalidRequest', relativePath));
    }
    const file = files.get(relativePath);
    if (file === undefined) return Promise.reject(new DocumentOpenError('notFound', relativePath));
    this.readFiles.push(`${root}|${relativePath}`);
    return Promise.resolve({
      location: InMemoryDocumentFiles.locationOf(`${root}\\${relativePath.replaceAll('/', '\\')}`),
      text: file.text,
      encoding: 'utf-8',
      hasByteOrderMark: false,
      lineEnding: lineEndingOf(file.text),
      modifiedAtMs: file.modifiedAtMs,
    });
  }

  private manifestFileOf(path: string, files: ReadonlyMap<string, StoredFile>): SpecProjectFile {
    const file = files.get(path) ?? { text: '', modifiedAtMs: 0 };
    return {
      path,
      sizeBytes: new TextEncoder().encode(file.text).length,
      modifiedAtMs: file.modifiedAtMs,
      text: CONFIGURATION_FILE.test(path) ? file.text : null,
    };
  }
}
