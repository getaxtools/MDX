import type { Translator } from '@mdx/i18n';
import type { DocumentLocation } from '@mdx/platform';
import type { SpecStructureRendering } from '@mdx/renderer';

const DELTA_SPEC = /\/openspec\/changes\/(?:archive\/)?[^/]+\/specs\/.+\/spec\.md$/i;
const MAIN_SPEC = /\/openspec\/specs\/.+\/spec\.md$/i;

function specDocumentKindOf(path: string): SpecStructureRendering['kind'] | undefined {
  if (DELTA_SPEC.test(path)) return 'deltaSpec';
  return MAIN_SPEC.test(path) ? 'mainSpec' : undefined;
}

/** How the renderer marks a document of a spec project: a change's delta, a capability's spec, or neither. */
export function specStructureFor(
  location: DocumentLocation,
  translator: Translator,
): SpecStructureRendering | undefined {
  const kind = specDocumentKindOf(location.displayPath.replaceAll('\\', '/'));
  return kind === undefined ? undefined : specRenderingOf(kind, translator);
}

export function specRenderingOf(
  kind: SpecStructureRendering['kind'],
  translator: Translator,
): SpecStructureRendering {
  return {
    kind,
    sectionLabels: {
      added: translator.translate('specViewer.delta.added'),
      modified: translator.translate('specViewer.delta.modified'),
      removed: translator.translate('specViewer.delta.removed'),
      renamed: translator.translate('specViewer.delta.renamed'),
    },
  };
}
