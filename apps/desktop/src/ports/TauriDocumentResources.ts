import { convertFileSrc } from '@tauri-apps/api/core';
import type { DocumentResourcesPort } from '@mdx/platform';

const IMAGE_PROTOCOL = 'mdx-image';

export class TauriDocumentResources implements DocumentResourcesPort {
  private readonly imageBaseUrl = convertFileSrc('', IMAGE_PROTOCOL);

  imageUrl(documentPath: string, source: string): string {
    const query = new URLSearchParams({ document: documentPath, source });
    return `${this.imageBaseUrl}?${query.toString()}`;
  }
}
