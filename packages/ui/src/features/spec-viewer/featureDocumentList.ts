import type { FeatureDocuments } from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';

export interface FeatureDocumentEntry {
  readonly label: string;
  /** Relative to the scanned root; undefined for a document not written yet. */
  readonly path?: string | undefined;
}

const NAMED_DOCUMENTS: readonly (readonly [
  MessageKey,
  keyof Omit<FeatureDocuments, 'contracts' | 'checklists'>,
])[] = [
  ['specViewer.document.spec', 'spec'],
  ['specViewer.document.plan', 'plan'],
  ['specViewer.document.tasks', 'tasks'],
  ['specViewer.document.research', 'research'],
  ['specViewer.document.dataModel', 'dataModel'],
  ['specViewer.document.quickstart', 'quickstart'],
];

function fileNameOf(path: string): string {
  return path.split('/').at(-1) ?? path;
}

/** A feature's documents in the order the layout writes them, missing ones included; then contracts and checklists. */
export function featureDocumentEntries(
  documents: FeatureDocuments,
  translator: Translator,
): FeatureDocumentEntry[] {
  return [
    ...NAMED_DOCUMENTS.map(([key, name]) => ({ label: translator.translate(key), path: documents[name] })),
    ...documents.contracts.map((path) => ({
      label: translator.translate('specViewer.document.contract', { name: fileNameOf(path) }),
      path,
    })),
    ...documents.checklists.map((path) => ({
      label: translator.translate('specViewer.document.checklist', { name: fileNameOf(path) }),
      path,
    })),
  ];
}
