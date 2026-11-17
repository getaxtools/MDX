import type { SpecProjectManifest, SpecProjectPort } from '@mdx/platform';
import type { ProjectTextReader } from './activeChangeFindings';

interface CachedText {
  /** Undefined for a file the scan did not list, which is kept only until the next scan. */
  readonly modifiedAtMs: number | undefined;
  readonly reading: Promise<string | undefined>;
}

/** The texts read from each scanned folder, kept while a file's modified time stays the same. */
export class ProjectTextCache {
  private readonly textsByFolder = new Map<string, Map<string, CachedText>>();

  constructor(private readonly specProjects: SpecProjectPort) {}

  /**
   * Reads each file once, however many views need it, and again only once its modified time changes.
   * A read that fails is not kept, so the next scan tries again.
   */
  readerFor(folderPath: string, manifest: SpecProjectManifest): ProjectTextReader {
    const texts = this.textsByFolder.get(folderPath) ?? new Map<string, CachedText>();
    this.textsByFolder.set(folderPath, texts);
    const modifiedTimes = new Map(manifest.files.map((file) => [file.path, file.modifiedAtMs]));
    for (const path of texts.keys()) if (!modifiedTimes.has(path)) texts.delete(path);
    return (relativePath) => {
      const modifiedAtMs = modifiedTimes.get(relativePath);
      const known = texts.get(relativePath);
      if (known && known.modifiedAtMs === modifiedAtMs) return known.reading;
      const cached: CachedText = { modifiedAtMs, reading: this.read(folderPath, relativePath) };
      texts.set(relativePath, cached);
      void cached.reading.then((text) => {
        if (text === undefined && texts.get(relativePath) === cached) texts.delete(relativePath);
      });
      return cached.reading;
    };
  }

  clear(): void {
    this.textsByFolder.clear();
  }

  private read(folderPath: string, relativePath: string): Promise<string | undefined> {
    return this.specProjects
      .readProjectFile(folderPath, relativePath)
      .then((document) => document.text)
      .catch(() => undefined);
  }
}
