import type { Favourite, RecentFile, ViewerSession, ViewerState } from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';
import { DocumentOpenError, type DocumentRequestsPort, type OpenedDocument } from '@mdx/platform';
import type { MarkdownRenderer, OutlineEntry } from '@mdx/renderer';
import type { ViewerCommand } from './viewerCommands';

export const STATE_SAVE_DELAY_MS = 500;

export interface ViewerControllerDependencies {
  readonly session: ViewerSession;
  readonly requests: DocumentRequestsPort;
  readonly renderer: MarkdownRenderer;
  readonly translator: Translator;
}

export interface RenderedActiveDocument {
  readonly canonicalKey: string;
  readonly fileName: string;
  readonly html: string;
  readonly outline: readonly OutlineEntry[];
}

export interface ViewerSnapshot {
  readonly viewer: ViewerState;
  readonly activeDocument?: RenderedActiveDocument;
  readonly notice?: string;
}

type SnapshotListener = (snapshot: ViewerSnapshot) => void;

export class ViewerController {
  private snapshot: ViewerSnapshot;
  private readonly listeners = new Set<SnapshotListener>();
  private readonly stopActions: (() => void)[] = [];
  private pendingSave: ReturnType<typeof setTimeout> | undefined;
  private renderedDocument: OpenedDocument | undefined;
  private activeDocument: RenderedActiveDocument | undefined;

  constructor(private readonly dependencies: ViewerControllerDependencies) {
    this.snapshot = { viewer: dependencies.session.currentState() };
  }

  async start(): Promise<void> {
    const { session, requests } = this.dependencies;
    const { wasReset } = await session.restore();
    if (wasReset) this.showNotice('errors.appState.reset');
    this.stopActions.push(session.subscribe(() => this.handleSessionChange()));
    this.stopActions.push(requests.onDocumentsRequested((paths) => void this.openDocuments(paths)));
    await this.openDocuments(await requests.takeStartupDocuments());
    await this.refreshActiveDocument();
  }

  stop(): void {
    for (const stopAction of this.stopActions.splice(0)) stopAction();
    clearTimeout(this.pendingSave);
  }

  async saveNow(): Promise<void> {
    clearTimeout(this.pendingSave);
    this.pendingSave = undefined;
    await this.dependencies.session.save();
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  async openDocuments(paths: readonly string[]): Promise<void> {
    for (const path of paths) await this.openDocument(path);
  }

  async openFavourite(favourite: Favourite): Promise<void> {
    if (favourite.kind === 'file') await this.openDocument(favourite.location.displayPath);
  }

  async openRecentFile(recentFile: RecentFile): Promise<void> {
    await this.openDocument(recentFile.location.displayPath);
  }

  activateTab(canonicalKey: string): void {
    this.dependencies.session.updateTabs((tabStrip) => tabStrip.activate(canonicalKey));
  }

  closeTab(canonicalKey: string): void {
    this.dependencies.session.updateTabs((tabStrip) => tabStrip.close(canonicalKey));
  }

  async execute(command: ViewerCommand): Promise<void> {
    const { session } = this.dependencies;
    const activeTab = session.currentState().tabStrip.activeTab();
    switch (command.kind) {
      case 'openDocuments':
        await this.openDocuments(await this.dependencies.requests.pickDocuments());
        return;
      case 'closeActiveTab':
        if (activeTab) this.closeTab(activeTab.location.canonicalKey);
        return;
      case 'nextTab':
        session.updateTabs((tabStrip) => tabStrip.activateNext());
        return;
      case 'previousTab':
        session.updateTabs((tabStrip) => tabStrip.activatePrevious());
        return;
      case 'activateTabNumber':
        session.updateTabs((tabStrip) => tabStrip.activateByNumberKey(command.numberKey));
        return;
      case 'reopenClosedTab':
        session.updateTabs((tabStrip) => tabStrip.reopenLastClosed());
        return;
      case 'toggleFavourite':
        if (activeTab)
          session.updateFavourites((favourites) => favourites.toggle(activeTab.location, 'file'));
        return;
    }
  }

  showNotice(key: MessageKey, values?: Readonly<Record<string, string>>): void {
    this.publish(this.composeSnapshot(this.dependencies.translator.translate(key, values)));
  }

  dismissNotice(): void {
    this.publish(this.composeSnapshot(undefined));
  }

  private async openDocument(path: string): Promise<void> {
    try {
      await this.dependencies.session.openDocument(path);
    } catch (error) {
      this.showOpenFailure(error, path);
    }
  }

  private showOpenFailure(error: unknown, path: string): void {
    const key = error instanceof DocumentOpenError ? error.messageKey : 'errors.document.unreadable';
    this.showNotice(key, { path });
  }

  private handleSessionChange(): void {
    this.publish(this.composeSnapshot(this.snapshot.notice));
    this.scheduleSave();
    void this.refreshActiveDocument();
  }

  private scheduleSave(): void {
    clearTimeout(this.pendingSave);
    this.pendingSave = setTimeout(() => void this.dependencies.session.save(), STATE_SAVE_DELAY_MS);
  }

  private async refreshActiveDocument(): Promise<void> {
    const document = await this.loadActiveDocument();
    if (document === this.renderedDocument) return;
    this.renderedDocument = document;
    this.activeDocument = document ? this.render(document) : undefined;
    this.publish(this.composeSnapshot(this.snapshot.notice));
  }

  private async loadActiveDocument(): Promise<OpenedDocument | undefined> {
    const activeTab = this.dependencies.session.currentState().tabStrip.activeTab();
    if (!activeTab) return undefined;
    try {
      return await this.dependencies.session.loadActiveDocument();
    } catch (error) {
      this.showOpenFailure(error, activeTab.location.displayPath);
      return undefined;
    }
  }

  private render(document: OpenedDocument): RenderedActiveDocument {
    const { html, outline } = this.dependencies.renderer.render(document.text);
    return {
      canonicalKey: document.location.canonicalKey,
      fileName: document.location.fileName,
      html,
      outline,
    };
  }

  private composeSnapshot(notice: string | undefined): ViewerSnapshot {
    return {
      viewer: this.dependencies.session.currentState(),
      ...(this.activeDocument ? { activeDocument: this.activeDocument } : {}),
      ...(notice === undefined ? {} : { notice }),
    };
  }

  private publish(snapshot: ViewerSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
