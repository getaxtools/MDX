import { NavigationHistory, type NavigationStep, type ViewerSession } from '@mdx/core';
import { isUntitledLocation, type DocumentLocation } from '@mdx/platform';

export type NavigationCommand = { readonly kind: 'goBack' } | { readonly kind: 'goForward' };

/** Back and Forward between the documents the user has shown, reopening closed ones from disk. */
export class DocumentNavigation {
  private history = NavigationHistory.empty();
  private isReturning = false;

  constructor(
    private readonly session: ViewerSession,
    private readonly openDocument: (path: string) => Promise<void>,
  ) {}

  /** Call whenever the session changes; showing a different document adds it to the history. */
  recordActiveDocument(): void {
    if (this.isReturning) return;
    const location = this.session.currentState().tabStrip.activeTab()?.location;
    if (location) this.history = this.history.visit(location);
  }

  forgetHistory(): void {
    this.history = NavigationHistory.empty();
  }

  goBack(): Promise<void> {
    return this.go(this.history.back((location) => this.canShow(location)));
  }

  goForward(): Promise<void> {
    return this.go(this.history.forward((location) => this.canShow(location)));
  }

  private async go(step: NavigationStep | undefined): Promise<void> {
    if (!step) return;
    this.history = step.history;
    const { canonicalKey, displayPath } = step.location;
    this.isReturning = true;
    try {
      if (this.isOpen(step.location)) this.session.updateTabs((tabStrip) => tabStrip.activate(canonicalKey));
      else await this.openDocument(displayPath);
    } finally {
      this.isReturning = false;
    }
  }

  private canShow(location: DocumentLocation): boolean {
    return this.isOpen(location) || !isUntitledLocation(location);
  }

  private isOpen(location: DocumentLocation): boolean {
    return this.session
      .currentState()
      .tabStrip.tabs()
      .some((tab) => tab.location.canonicalKey === location.canonicalKey);
  }
}
