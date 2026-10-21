// The official markdown-it plugins ship without type declarations.

declare module 'markdown-it-abbr' {
  import type { MarkdownIt } from 'markdown-it';
  export default function abbreviations(markdown: MarkdownIt): void;
}

declare module 'markdown-it-deflist' {
  import type { MarkdownIt } from 'markdown-it';
  export default function definitionLists(markdown: MarkdownIt): void;
}

declare module 'markdown-it-footnote' {
  import type { MarkdownIt } from 'markdown-it';
  export default function footnotes(markdown: MarkdownIt): void;
}

declare module 'markdown-it-mark' {
  import type { MarkdownIt } from 'markdown-it';
  export default function marks(markdown: MarkdownIt): void;
}

declare module 'markdown-it-sub' {
  import type { MarkdownIt } from 'markdown-it';
  export default function subscripts(markdown: MarkdownIt): void;
}

declare module 'markdown-it-sup' {
  import type { MarkdownIt } from 'markdown-it';
  export default function superscripts(markdown: MarkdownIt): void;
}

declare module 'markdown-it-emoji/lib/bare.mjs' {
  import type { MarkdownIt } from 'markdown-it';
  export interface EmojiOptions {
    readonly defs: Readonly<Record<string, string>>;
    readonly shortcuts: Readonly<Record<string, string | readonly string[]>>;
    readonly enabled: readonly string[];
  }
  export default function emoji(markdown: MarkdownIt, options: EmojiOptions): void;
}

declare module 'markdown-it-emoji/lib/data/full.mjs' {
  const emojiByName: Readonly<Record<string, string>>;
  export default emojiByName;
}
