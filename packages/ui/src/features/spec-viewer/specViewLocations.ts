import { applyDelta, type ChangeSummary, type ProjectDocument, type SpecProjectSummary } from '@mdx/core';
import type { Translator } from '@mdx/i18n';
import type { DocumentLocation } from '@mdx/platform';
import type { MarkdownRenderer } from '@mdx/renderer';
import { changePageLocationOf } from './specChangePage';
import { dashboardLocationOf } from './specDashboard';
import { featurePageLocationOf } from './specFeaturePage';
import { specRenderingOf } from './specDocumentRendering';
import { previewLocationOf, type SpecPreview } from './specPreview';
import type {
  OpenSpecChangeCommand,
  OpenSpecDashboardCommand,
  OpenSpecFeatureCommand,
  OpenSpecPreviewCommand,
} from './specViewerCommands';
import type { SpecProjectsView, SpecViewerActions } from './SpecViewerActions';
import type { ScannedSpecRoot } from './specProjectTree';

function scannedRootOf(view: SpecProjectsView | undefined, rootKey: string) {
  return view?.roots?.find((scanned) => scanned.root.canonicalKey === rootKey);
}

/** The tab a dashboard or change page command opens, while its project is still shown. */
export function viewLocationFor(
  view: SpecProjectsView | undefined,
  command: OpenSpecDashboardCommand | OpenSpecChangeCommand | OpenSpecFeatureCommand,
  translator: Translator,
): DocumentLocation | undefined {
  const scanned = scannedRootOf(view, command.rootKey);
  if (command.kind === 'openSpecDashboard') {
    const project = scanned?.projects.find((candidate) => candidate.folder === command.folder);
    return project ? dashboardLocationOf(command.rootKey, project, translator) : undefined;
  }
  if (command.kind === 'openSpecFeature') {
    const feature = scanned?.projects
      .flatMap((project) => project.features)
      .find((candidate) => candidate.folder === command.featureFolder);
    return feature ? featurePageLocationOf(command.rootKey, feature, translator) : undefined;
  }
  const change = scanned?.projects
    .flatMap((project) => project.activeChanges)
    .find((candidate) => candidate.folder === command.changeFolder);
  return change ? changePageLocationOf(command.rootKey, change, translator) : undefined;
}

export interface PreviewServices {
  readonly actions: SpecViewerActions;
  readonly renderer: MarkdownRenderer;
  readonly translator: Translator;
}

export interface OpenedPreview {
  readonly location: DocumentLocation;
  readonly preview: SpecPreview;
}

interface PreviewTarget {
  readonly scanned: ScannedSpecRoot;
  readonly project: SpecProjectSummary;
  readonly change: ChangeSummary;
  readonly delta: ProjectDocument;
}

function previewTargetOf(
  view: SpecProjectsView | undefined,
  command: OpenSpecPreviewCommand,
): PreviewTarget | undefined {
  const scanned = scannedRootOf(view, command.rootKey);
  for (const project of scanned?.projects ?? []) {
    const change = project.activeChanges.find((candidate) => candidate.folder === command.changeFolder);
    const delta = change?.documents.deltas.find((candidate) => candidate.name === command.capability);
    if (scanned && change && delta) return { scanned, project, change, delta };
  }
  return undefined;
}

async function applicationFor(
  target: PreviewTarget,
  command: OpenSpecPreviewCommand,
  actions: SpecViewerActions,
) {
  const rootPath = target.scanned.root.displayPath;
  const capabilitySpec = target.project.capabilities.find(
    (capability) => capability.name === command.capability,
  );
  return applyDelta({
    capability: command.capability,
    changeName: command.changeFolder.split('/').at(-1) ?? target.change.name,
    deltaText: (await actions.readProjectText(rootPath, target.delta.path)) ?? '',
    currentSpecText: capabilitySpec
      ? await actions.readProjectText(rootPath, capabilitySpec.path)
      : undefined,
  });
}

/** Applies a change's delta to the current spec, as archiving would, ready to show in a tab. */
export async function specPreviewFor(
  command: OpenSpecPreviewCommand,
  { actions, renderer, translator }: PreviewServices,
): Promise<OpenedPreview | undefined> {
  const target = previewTargetOf(actions.view(), command);
  if (!target) return undefined;
  const application = await applicationFor(target, command, actions);
  const html =
    application.outcome === 'applied'
      ? renderer.render(application.spec.text, { specStructure: specRenderingOf('mainSpec', translator) })
          .html
      : undefined;
  const changeName = target.change.name;
  const location = previewLocationOf(
    command.rootKey,
    { changeFolder: command.changeFolder, changeName, capability: command.capability },
    translator,
  );
  return { location, preview: { changeName, capability: command.capability, application, html } };
}
