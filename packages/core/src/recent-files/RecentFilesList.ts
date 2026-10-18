import type { DocumentLocation } from '@mdx/platform';

export const MAX_RECENT_FILES = 25;

export interface RecentFile {
  readonly location: DocumentLocation;
  readonly isPinned: boolean;
  readonly lastOpenedAtMs: number;
}

export class RecentFilesList {
  private constructor(private readonly newestFirst: readonly RecentFile[]) {}

  static empty(): RecentFilesList {
    return new RecentFilesList([]);
  }

  static fromRecentFiles(recentFiles: readonly RecentFile[]): RecentFilesList {
    const newestFirst = [...recentFiles].sort(
      (first, second) => second.lastOpenedAtMs - first.lastOpenedAtMs,
    );
    const withoutDuplicates = newestFirst.filter(
      (recentFile, index) =>
        newestFirst.findIndex((other) => other.location.canonicalKey === recentFile.location.canonicalKey) ===
        index,
    );
    return new RecentFilesList(trimToCapacity(withoutDuplicates));
  }

  entries(): readonly RecentFile[] {
    return [
      ...this.newestFirst.filter((file) => file.isPinned),
      ...this.newestFirst.filter((file) => !file.isPinned),
    ];
  }

  has(canonicalKey: string): boolean {
    return this.newestFirst.some((file) => file.location.canonicalKey === canonicalKey);
  }

  add(location: DocumentLocation, openedAtMs: number): RecentFilesList {
    const existing = this.find(location.canonicalKey);
    const reopened: RecentFile = {
      location,
      isPinned: existing?.isPinned ?? false,
      lastOpenedAtMs: openedAtMs,
    };
    const others = this.newestFirst.filter((file) => file.location.canonicalKey !== location.canonicalKey);
    return new RecentFilesList(trimToCapacity([reopened, ...others]));
  }

  remove(canonicalKey: string): RecentFilesList {
    return new RecentFilesList(
      this.newestFirst.filter((file) => file.location.canonicalKey !== canonicalKey),
    );
  }

  pin(canonicalKey: string): RecentFilesList {
    return this.withPinnedState(canonicalKey, true);
  }

  unpin(canonicalKey: string): RecentFilesList {
    return this.withPinnedState(canonicalKey, false);
  }

  clearUnpinned(): RecentFilesList {
    return new RecentFilesList(this.newestFirst.filter((file) => file.isPinned));
  }

  clearAll(): RecentFilesList {
    return RecentFilesList.empty();
  }

  private find(canonicalKey: string): RecentFile | undefined {
    return this.newestFirst.find((file) => file.location.canonicalKey === canonicalKey);
  }

  private withPinnedState(canonicalKey: string, isPinned: boolean): RecentFilesList {
    return new RecentFilesList(
      this.newestFirst.map((file) =>
        file.location.canonicalKey === canonicalKey ? { ...file, isPinned } : file,
      ),
    );
  }
}

function trimToCapacity(newestFirst: readonly RecentFile[]): readonly RecentFile[] {
  const trimmed = [...newestFirst];
  while (trimmed.length > MAX_RECENT_FILES) {
    const oldestUnpinnedIndex = trimmed.findLastIndex((file) => !file.isPinned);
    if (oldestUnpinnedIndex === -1) break;
    trimmed.splice(oldestUnpinnedIndex, 1);
  }
  return trimmed;
}
