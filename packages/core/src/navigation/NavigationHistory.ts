import type { DocumentLocation } from '@mdx/platform';

export const MAX_NAVIGATION_ENTRIES = 50;

export interface NavigationStep {
  readonly history: NavigationHistory;
  readonly location: DocumentLocation;
}

/** The documents the user moved between, so Back and Forward can return to them as a browser does. */
export class NavigationHistory {
  private constructor(
    private readonly locations: readonly DocumentLocation[],
    private readonly position: number,
  ) {}

  static empty(): NavigationHistory {
    return new NavigationHistory([], -1);
  }

  current(): DocumentLocation | undefined {
    return this.locations[this.position];
  }

  /** Records arriving at a document; the documents ahead of the current one are forgotten. */
  visit(location: DocumentLocation): NavigationHistory {
    if (this.current()?.canonicalKey === location.canonicalKey) return this;
    const kept = [...this.locations.slice(0, this.position + 1), location].slice(-MAX_NAVIGATION_ENTRIES);
    return new NavigationHistory(kept, kept.length - 1);
  }

  /** The previous document that can still be shown, skipping ones that cannot, such as closed new documents. */
  back(canShow: (location: DocumentLocation) => boolean): NavigationStep | undefined {
    return this.step(-1, canShow);
  }

  forward(canShow: (location: DocumentLocation) => boolean): NavigationStep | undefined {
    return this.step(1, canShow);
  }

  private step(
    direction: -1 | 1,
    canShow: (location: DocumentLocation) => boolean,
  ): NavigationStep | undefined {
    const currentKey = this.current()?.canonicalKey;
    for (
      let position = this.position + direction;
      position >= 0 && position < this.locations.length;
      position += direction
    ) {
      const location = this.locations[position];
      if (location && location.canonicalKey !== currentKey && canShow(location)) {
        return { history: new NavigationHistory(this.locations, position), location };
      }
    }
    return undefined;
  }
}
