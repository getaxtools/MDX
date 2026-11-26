import {
  parseMainSpec,
  type ChangedRequirement,
  type DeltaApplication,
  type DeltaRefusalReason,
} from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';
import { viewLocation, type DocumentLocation } from '@mdx/platform';

/** "Spec after this change" for one capability a change touches. */
export interface SpecPreview {
  readonly changeName: string;
  readonly capability: string;
  readonly application: DeltaApplication;
  /** The rendered, sanitized spec after the change, when the delta applies. */
  readonly html?: string | undefined;
}

export interface PreviewRequirement {
  readonly name: string;
  /** What the change does to it, in words, or undefined when it stays as it is. */
  readonly label?: string | undefined;
}

const PREVIEW_VIEW = 'spec-preview';

const REFUSAL_KEYS: Readonly<Record<DeltaRefusalReason, MessageKey>> = {
  unpairedRename: 'specViewer.refusal.unpairedRename',
  requirementUnderUnknownSection: 'specViewer.refusal.requirementUnderUnknownSection',
  duplicateInSection: 'specViewer.refusal.duplicateInSection',
  inTwoSections: 'specViewer.refusal.inTwoSections',
  modifiedUsesRenamedName: 'specViewer.refusal.modifiedUsesRenamedName',
  renameCollidesWithAdded: 'specViewer.refusal.renameCollidesWithAdded',
  noOperations: 'specViewer.refusal.noOperations',
  changeOnNewCapability: 'specViewer.refusal.changeOnNewCapability',
  currentSpecInvalid: 'specViewer.refusal.currentSpecInvalid',
  renameSourceNotFound: 'specViewer.refusal.renameSourceNotFound',
  renameSourceMisspelled: 'specViewer.refusal.renameSourceMisspelled',
  renameTargetExists: 'specViewer.refusal.renameTargetExists',
  renameTargetNearMatch: 'specViewer.refusal.renameTargetNearMatch',
  removedMisspelled: 'specViewer.refusal.removedMisspelled',
  modifiedNotFound: 'specViewer.refusal.modifiedNotFound',
  modifiedDropsScenario: 'specViewer.refusal.modifiedDropsScenario',
  addedExists: 'specViewer.refusal.addedExists',
  addedNearMatch: 'specViewer.refusal.addedNearMatch',
};

/** The tab of a capability's preview after a change. */
export function previewLocationOf(
  rootKey: string,
  delta: { readonly changeFolder: string; readonly changeName: string; readonly capability: string },
  translator: Translator,
): DocumentLocation {
  const title = translator.translate('specViewer.preview.tabTitle', {
    name: delta.changeName,
    section: delta.capability,
  });
  return viewLocation(`${PREVIEW_VIEW}:${rootKey}|${delta.changeFolder}|${delta.capability}`, title);
}

function labelOf(change: ChangedRequirement | undefined, translator: Translator): string | undefined {
  if (!change) return undefined;
  if (change.isAdded) return translator.translate('specViewer.delta.added');
  if (change.renamedFrom !== undefined) {
    const renamed = translator.translate('specViewer.preview.renamedFrom', { name: change.renamedFrom });
    return change.isModified ? `${translator.translate('specViewer.delta.modified')}, ${renamed}` : renamed;
  }
  return change.isModified ? translator.translate('specViewer.delta.modified') : undefined;
}

/** The requirements of the spec after the change, in order, each with what the change did to it. */
export function previewRequirementsOf(preview: SpecPreview, translator: Translator): PreviewRequirement[] {
  if (preview.application.outcome !== 'applied') return [];
  const { spec } = preview.application;
  const changes = new Map(spec.changedRequirements.map((change) => [change.name, change]));
  return parseMainSpec(spec.text).requirements.map((block) => ({
    name: block.name,
    label: labelOf(changes.get(block.name), translator),
  }));
}

/** Why the delta cannot be applied, naming the requirement. */
export function refusalMessageOf(preview: SpecPreview, translator: Translator): string | undefined {
  if (preview.application.outcome !== 'refused') return undefined;
  const { refusal } = preview.application;
  const section =
    refusal.reason === 'currentSpecInvalid'
      ? String(refusal.line ?? '')
      : (refusal.detail?.split('\n').join(', ') ?? '');
  return translator.translate(REFUSAL_KEYS[refusal.reason], { name: refusal.requirement ?? '', section });
}
