import { isRecord } from '../session/savedValues';

export interface Snippet {
  readonly id: string;
  readonly name: string;
  /** A short word that also finds the snippet in the insert menu, such as `sig`. */
  readonly trigger: string;
  readonly body: string;
}

/** The user's snippets and the built-in ones they chose to hide; stored in app data only. */
export interface SnippetLibrary {
  readonly snippets: readonly Snippet[];
  readonly hiddenBuiltInIds: readonly string[];
}

export type SnippetRefusal = 'nameMissing' | 'nameTaken' | 'nameTooLong' | 'bodyTooLong' | 'tooMany';

export const MAX_SNIPPETS = 200;
export const MAX_SNIPPET_BODY_CHARACTERS = 10_000;
export const MAX_SNIPPET_NAME_CHARACTERS = 80;
const MAX_TRIGGER_CHARACTERS = 30;

export const EMPTY_SNIPPET_LIBRARY: SnippetLibrary = { snippets: [], hiddenBuiltInIds: [] };

export const BUILT_IN_SNIPPETS: readonly Snippet[] = [
  { id: 'builtIn.date', name: 'Date', trigger: 'date', body: '{{date}}' },
  { id: 'builtIn.time', name: 'Time', trigger: 'time', body: '{{time}}' },
  {
    id: 'builtIn.table',
    name: 'Table, 3 by 3',
    trigger: 'table',
    body: '| {{1:Column}} |  |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n|  |  |  |',
  },
  {
    id: 'builtIn.frontMatter',
    name: 'Front matter',
    trigger: 'frontmatter',
    body: '---\ntitle: {{1:{{title}}}}\ndate: {{date:YYYY-MM-DD}}\n---\n',
  },
  { id: 'builtIn.toggle', name: 'Toggle', trigger: 'toggle', body: '> [!NOTE]- {{1:Title}}\n> {{2:Text}}' },
];

export function isBuiltInSnippetId(id: string): boolean {
  return BUILT_IN_SNIPPETS.some((snippet) => snippet.id === id);
}

/** The snippets to offer: built-ins that are not hidden, then the user's own. */
export function availableSnippets(library: SnippetLibrary): Snippet[] {
  return [
    ...BUILT_IN_SNIPPETS.filter((snippet) => !library.hiddenBuiltInIds.includes(snippet.id)),
    ...library.snippets,
  ];
}

/** Why a new or changed snippet cannot be saved, or undefined when it can. */
export function snippetRefusal(
  library: SnippetLibrary,
  draft: Omit<Snippet, 'id'> & { readonly id?: string },
): SnippetRefusal | undefined {
  const name = draft.name.trim();
  if (name === '') return 'nameMissing';
  if (name.length > MAX_SNIPPET_NAME_CHARACTERS) return 'nameTooLong';
  if (draft.body.length > MAX_SNIPPET_BODY_CHARACTERS) return 'bodyTooLong';
  const others = [...BUILT_IN_SNIPPETS, ...library.snippets].filter((snippet) => snippet.id !== draft.id);
  if (others.some((snippet) => snippet.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
    return 'nameTaken';
  const isNew = !library.snippets.some((snippet) => snippet.id === draft.id);
  return isNew && library.snippets.length >= MAX_SNIPPETS ? 'tooMany' : undefined;
}

/** Adds a snippet, or replaces the one with the same id; a refused snippet changes nothing. */
export function saveSnippet(library: SnippetLibrary, snippet: Snippet): SnippetLibrary {
  if (isBuiltInSnippetId(snippet.id) || snippetRefusal(library, snippet)) return library;
  const cleaned = { ...snippet, name: snippet.name.trim(), trigger: snippet.trigger.trim() };
  const isExisting = library.snippets.some((existing) => existing.id === snippet.id);
  const snippets = isExisting
    ? library.snippets.map((existing) => (existing.id === snippet.id ? cleaned : existing))
    : [...library.snippets, cleaned];
  return { ...library, snippets };
}

export function deleteSnippet(library: SnippetLibrary, id: string): SnippetLibrary {
  return { ...library, snippets: library.snippets.filter((snippet) => snippet.id !== id) };
}

/** Built-ins cannot be deleted or changed, only hidden and shown again. */
export function setBuiltInSnippetHidden(
  library: SnippetLibrary,
  id: string,
  isHidden: boolean,
): SnippetLibrary {
  if (!isBuiltInSnippetId(id)) return library;
  const others = library.hiddenBuiltInIds.filter((hiddenId) => hiddenId !== id);
  return { ...library, hiddenBuiltInIds: isHidden ? [...others, id] : others };
}

/** Reads the saved library; anything missing or malformed gives an empty one. */
export function parseSnippetLibrary(saved: unknown): SnippetLibrary {
  if (!isRecord(saved)) return EMPTY_SNIPPET_LIBRARY;
  const snippets = Array.isArray(saved.snippets) ? saved.snippets.flatMap(parseSnippet) : [];
  const hiddenBuiltInIds = Array.isArray(saved.hiddenBuiltInIds)
    ? saved.hiddenBuiltInIds.filter((id): id is string => typeof id === 'string' && isBuiltInSnippetId(id))
    : [];
  return { snippets: snippets.slice(0, MAX_SNIPPETS), hiddenBuiltInIds };
}

function parseSnippet(value: unknown): Snippet[] {
  if (!isRecord(value)) return [];
  const { id, name, trigger, body } = value;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof body !== 'string') return [];
  if (name.trim() === '' || name.length > MAX_SNIPPET_NAME_CHARACTERS) return [];
  if (body.length > MAX_SNIPPET_BODY_CHARACTERS || isBuiltInSnippetId(id)) return [];
  const triggerWord = typeof trigger === 'string' ? trigger.slice(0, MAX_TRIGGER_CHARACTERS) : '';
  return [{ id, name, trigger: triggerWord, body }];
}
