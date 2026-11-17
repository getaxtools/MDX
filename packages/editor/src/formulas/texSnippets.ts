import type { Command } from '@codemirror/view';
import { snippetInsertion } from '../snippets/snippetFields';
import { texWithFields } from './texFields';

/** What a word typed in the TeX source becomes when Tab follows it. */
export const TEX_SNIPPETS: Readonly<Record<string, string>> = {
  frac: String.raw`\frac{#{}}{#{}}`,
  sqrt: String.raw`\sqrt{#{}}`,
  sum: String.raw`\sum_{#{}}^{#{}}`,
  int: String.raw`\int_{#{}}^{#{}}`,
  lim: String.raw`\lim_{#{} \to #{}}`,
  mat2: String.raw`\begin{pmatrix} #{} & #{} \\ #{} & #{} \end{pmatrix}`,
  cases: String.raw`\begin{cases} #{} & #{} \\ #{} & #{} \end{cases}`,
  align: String.raw`\begin{aligned} #{} &= #{} \\ #{} &= #{} \end{aligned}`,
};

/** A word at the caret that is not the name of a command, such as `frac` but not `\frac`. */
const WORD_BEFORE_CARET = /(?<![\\A-Za-z])[A-Za-z0-9]+$/;

/** Tab after a snippet's name writes its structure and selects its first placeholder. */
export const expandSnippetBeforeCaret: Command = (view) => {
  const { main } = view.state.selection;
  if (!main.empty) return false;
  const line = view.state.doc.lineAt(main.head);
  const word = WORD_BEFORE_CARET.exec(line.text.slice(0, main.head - line.from))?.[0];
  if (word === undefined || !Object.hasOwn(TEX_SNIPPETS, word)) return false;
  const template = TEX_SNIPPETS[word] ?? '';
  view.dispatch(
    snippetInsertion(view.state, { from: main.head - word.length, to: main.head }, () =>
      texWithFields(template),
    ),
  );
  return true;
};
