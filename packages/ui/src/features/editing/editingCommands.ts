import type { EditorMenuCommand, SectionAction } from '@mdx/editor';

export type EditingCommand =
  | { readonly kind: 'toggleEditing' }
  | { readonly kind: 'togglePreviewBesideEditor' }
  | { readonly kind: 'newDocument' }
  | { readonly kind: 'runEditorCommand'; readonly command: EditorMenuCommand }
  | { readonly kind: 'revertDocument' }
  | { readonly kind: 'reloadActiveDocument' }
  | { readonly kind: 'reloadFromDisk'; readonly canonicalKey: string }
  | { readonly kind: 'overwriteChangesOnDisk'; readonly canonicalKey: string }
  | { readonly kind: 'keepEditedText' }
  | { readonly kind: 'changeOutlineSection'; readonly line: number; readonly action: SectionAction };

/** Something for the open source editor to do: run a menu command, or show text reloaded from disk. */
export type EditorRequest =
  | {
      readonly id: number;
      readonly canonicalKey: string;
      readonly kind: 'command';
      readonly command: EditorMenuCommand;
    }
  | {
      readonly id: number;
      readonly canonicalKey: string;
      readonly kind: 'replaceText';
      readonly text: string;
    }
  | {
      readonly id: number;
      readonly canonicalKey: string;
      readonly kind: 'insertSnippet';
      readonly body: string;
    }
  | {
      readonly id: number;
      readonly canonicalKey: string;
      readonly kind: 'insertPictureLinks';
      readonly links: readonly string[];
      readonly point: { readonly x: number; readonly y: number };
    }
  | {
      readonly id: number;
      readonly canonicalKey: string;
      readonly kind: 'changeSection';
      readonly line: number;
      readonly action: SectionAction;
    };
