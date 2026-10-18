export interface DocumentLink {
  readonly kind: 'document' | 'external';
  readonly href: string;
}
