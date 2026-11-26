import type { Translator } from '@mdx/i18n';
import type { DocumentLocation } from '@mdx/platform';
import type { OutlineEntry, SpecStructureRendering } from '@mdx/renderer';
import { specDocumentPlaceOf, specDocumentRenderingOf } from './specCrossLinkTargets';
import { specRenderingOf, specStructureFor } from './specDocumentRendering';
import type { SpecProjectsView } from './SpecViewerActions';

export interface SpecDocumentRenderingsDependencies {
  readonly translator: Translator;
  readonly readText: (rootPath: string, relativePath: string) => Promise<string | undefined>;
  readonly outlineOf: (text: string) => readonly OutlineEntry[];
}

interface PreparedRendering {
  readonly key: string;
  readonly view: SpecProjectsView;
  readonly rendering: SpecStructureRendering;
}

/** Works out, before a document of a spec project renders, its structure and where its references lead. */
export class SpecDocumentRenderings {
  private prepared: PreparedRendering | undefined;

  constructor(private readonly dependencies: SpecDocumentRenderingsDependencies) {}

  /** Whether the document is in a scanned project and has not been prepared for this scan yet. */
  needsPreparing(location: DocumentLocation, view: SpecProjectsView | undefined): boolean {
    if (!view) return this.prepared !== undefined;
    const isCurrent = this.prepared?.key === location.canonicalKey && this.prepared.view === view;
    return !isCurrent && (this.prepared !== undefined || specDocumentPlaceOf(view, location) !== undefined);
  }

  /** Reads what the document's links need; a later scan of the project prepares it again. */
  async prepare(location: DocumentLocation, view: SpecProjectsView | undefined): Promise<void> {
    if (!view) {
      this.prepared = undefined;
      return;
    }
    if (this.prepared?.key === location.canonicalKey && this.prepared.view === view) return;
    const place = specDocumentPlaceOf(view, location);
    if (!place) {
      this.prepared = undefined;
      return;
    }
    const { readText, outlineOf, translator } = this.dependencies;
    const { kind, links } = await specDocumentRenderingOf(place, { readText, outlineOf });
    const rendering = { ...specRenderingOf(kind, translator), links };
    this.prepared = { key: location.canonicalKey, view, rendering };
  }

  /** Changes whenever a prepared rendering does, so the document renders again. */
  version(): object | undefined {
    return this.prepared;
  }

  renderingFor(location: DocumentLocation): SpecStructureRendering | undefined {
    if (this.prepared?.key === location.canonicalKey) return this.prepared.rendering;
    return specStructureFor(location, this.dependencies.translator);
  }
}
