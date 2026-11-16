import type { FeatureSummary } from '@mdx/core';
import type { Translator } from '@mdx/i18n';
import { isViewLocation, viewLocation, type DocumentLocation } from '@mdx/platform';
import type { SpecProjectsView } from './SpecViewerActions';
import type { ScannedSpecRoot } from './specProjectTree';

export interface ShownFeaturePage {
  readonly scanned: ScannedSpecRoot;
  readonly feature: FeatureSummary;
}

const FEATURE_PAGE_VIEW = 'spec-feature';

function featureViewKey(rootKey: string, featureFolder: string): string {
  return `${FEATURE_PAGE_VIEW}:${rootKey}|${featureFolder}`;
}

/** The tab of a feature's page. */
export function featurePageLocationOf(
  rootKey: string,
  feature: FeatureSummary,
  translator: Translator,
): DocumentLocation {
  const title = translator.translate('specViewer.featurePage.tabTitle', { name: feature.name });
  return viewLocation(featureViewKey(rootKey, feature.folder), title);
}

/** The feature whose page a tab shows, while it is still part of the workspace. */
export function shownFeaturePageOf(
  view: SpecProjectsView | undefined,
  location: DocumentLocation | undefined,
): ShownFeaturePage | undefined {
  if (!location || !isViewLocation(location)) return undefined;
  for (const scanned of view?.roots ?? []) {
    const feature = scanned.projects
      .flatMap((project) => project.features)
      .find(
        (candidate) =>
          viewLocation(featureViewKey(scanned.root.canonicalKey, candidate.folder), '').canonicalKey ===
          location.canonicalKey,
      );
    if (feature) return { scanned, feature };
  }
  return undefined;
}
