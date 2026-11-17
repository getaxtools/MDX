import { parseMainSpec, type SpecProjectSummary } from '@mdx/core';
import type { DocumentLocation } from '@mdx/platform';
import type { OutlineEntry, SpecCrossLinks, SpecStructureRendering } from '@mdx/renderer';
import type { SpecProjectsView } from './SpecViewerActions';
import type { ScannedSpecRoot } from './specProjectTree';

/** A document of a scanned spec project, by its path relative to the root. */
export interface SpecDocumentPlace {
  readonly scanned: ScannedSpecRoot;
  readonly project: SpecProjectSummary;
  readonly path: string;
}

export interface CrossLinkServices {
  readonly readText: (rootPath: string, relativePath: string) => Promise<string | undefined>;
  readonly outlineOf: (text: string) => readonly OutlineEntry[];
}

export interface SpecDocumentRendering {
  readonly kind: SpecStructureRendering['kind'];
  readonly links: SpecCrossLinks;
}

/** A document the links lead to, with its text. */
interface TargetDocument {
  readonly path: string;
  readonly text: string;
}

const USER_STORY_HEADING = /^User Story\s+(\d+)\b/i;
const REQUIREMENT_IDENTIFIER = /\b((?:FR|SC)-\d{3,})\b/g;

function normalizedPath(path: string): string {
  return path.replaceAll('\\', '/').toLowerCase();
}

/** The project and relative path of a document inside a scanned folder of the workspace. */
export function specDocumentPlaceOf(
  view: SpecProjectsView | undefined,
  location: DocumentLocation,
): SpecDocumentPlace | undefined {
  const documentPath = normalizedPath(location.displayPath);
  for (const scanned of view?.roots ?? []) {
    const rootPath = `${normalizedPath(scanned.root.displayPath).replace(/\/$/, '')}/`;
    if (!documentPath.startsWith(rootPath)) continue;
    const path = location.displayPath.replaceAll('\\', '/').slice(rootPath.length);
    const project =
      scanned.projects.find(
        (candidate) => candidate.folder !== '' && path.startsWith(`${candidate.folder}/`),
      ) ?? scanned.projects.find((candidate) => candidate.folder === '');
    if (project) return { scanned, project, path };
  }
  return undefined;
}

/** A link from one project document to another, relative to the first one's folder, with an optional anchor. */
export function relativeHref(fromPath: string, toPath: string, anchor?: string): string {
  const fromFolder = fromPath.split('/').slice(0, -1);
  const toParts = toPath.split('/');
  let common = 0;
  while (common < fromFolder.length && fromFolder[common] === toParts[common]) common += 1;
  const climb = Array.from({ length: fromFolder.length - common }, () => '..');
  const href = [...climb, ...toParts.slice(common).map(encodeURIComponent)].join('/');
  return anchor === undefined ? href : `${href}#${anchor}`;
}

function headingAtOrAbove(outline: readonly OutlineEntry[], lineIndex: number): OutlineEntry | undefined {
  return outline.filter((entry) => entry.line <= lineIndex).at(-1);
}

function featureLinks(place: SpecDocumentPlace, spec: TargetDocument, services: CrossLinkServices) {
  const outline = services.outlineOf(spec.text);
  const storyLinks = new Map<string, string>();
  for (const entry of outline) {
    const story = USER_STORY_HEADING.exec(entry.text)?.[1];
    if (story !== undefined && !storyLinks.has(`US${story}`)) {
      storyLinks.set(`US${story}`, relativeHref(place.path, spec.path, entry.id));
    }
  }
  const requirementIdLinks = new Map<string, string>();
  for (const [index, line] of spec.text.split(/\r\n|\r|\n/).entries()) {
    for (const match of line.matchAll(REQUIREMENT_IDENTIFIER)) {
      const identifier = match[1] ?? '';
      if (requirementIdLinks.has(identifier)) continue;
      requirementIdLinks.set(
        identifier,
        relativeHref(place.path, spec.path, headingAtOrAbove(outline, index)?.id),
      );
    }
  }
  return { storyLinks, requirementIdLinks };
}

function requirementLinks(place: SpecDocumentPlace, spec: TargetDocument, services: CrossLinkServices) {
  const outline = services.outlineOf(spec.text);
  return new Map(
    parseMainSpec(spec.text).requirements.map((block) => {
      const heading = outline.find((entry) => entry.line === block.line - 1);
      return [block.name, relativeHref(place.path, spec.path, heading?.id)] as const;
    }),
  );
}

function capabilityLinks(place: SpecDocumentPlace, changeDeltas: readonly { name: string; path: string }[]) {
  const links = new Map(changeDeltas.map((delta) => [delta.name, relativeHref(place.path, delta.path)]));
  for (const capability of place.project.capabilities) {
    links.set(capability.name, relativeHref(place.path, capability.path));
  }
  return links;
}

async function changeDocumentRendering(place: SpecDocumentPlace, services: CrossLinkServices) {
  const change = place.project.activeChanges.find((candidate) =>
    place.path.startsWith(`${candidate.folder}/`),
  );
  if (!change) return undefined;
  const delta = change.documents.deltas.find((candidate) => candidate.path === place.path);
  if (!delta)
    return {
      kind: 'specDocument' as const,
      links: { capabilityLinks: capabilityLinks(place, change.documents.deltas) },
    };
  const capability = place.project.capabilities.find((candidate) => candidate.name === delta.name);
  const rootPath = place.scanned.root.displayPath;
  const specText = capability ? await services.readText(rootPath, capability.path) : undefined;
  const links =
    capability && specText !== undefined
      ? requirementLinks(place, { path: capability.path, text: specText }, services)
      : undefined;
  return { kind: 'deltaSpec' as const, links: { requirementLinks: links } };
}

async function featureDocumentRendering(place: SpecDocumentPlace, services: CrossLinkServices) {
  const feature = place.project.features.find((candidate) => place.path.startsWith(`${candidate.folder}/`));
  if (!feature) return undefined;
  const specPath = feature.documents.spec;
  if (specPath === place.path) return { kind: 'featureSpec' as const, links: {} };
  const specText =
    specPath === undefined ? undefined : await services.readText(place.scanned.root.displayPath, specPath);
  const links =
    specPath === undefined || specText === undefined
      ? {}
      : featureLinks(place, { path: specPath, text: specText }, services);
  return { kind: 'specDocument' as const, links };
}

/** How a document of a spec project renders: its structure, and where its references lead. */
export async function specDocumentRenderingOf(
  place: SpecDocumentPlace,
  services: CrossLinkServices,
): Promise<SpecDocumentRendering> {
  const isCapabilitySpec = place.project.capabilities.some((capability) => capability.path === place.path);
  if (isCapabilitySpec) return { kind: 'mainSpec', links: {} };
  return (
    (await changeDocumentRendering(place, services)) ??
    (await featureDocumentRendering(place, services)) ?? { kind: 'specDocument', links: {} }
  );
}
