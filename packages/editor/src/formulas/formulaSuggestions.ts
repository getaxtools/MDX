import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { snippetInsertion } from '../snippets/snippetFields';
import { texWithFields } from './texFields';

/** A command the typesetter supports, with the number of arguments in braces it takes. */
export interface TexCommand {
  readonly name: string;
  readonly argumentCount: number;
}

export interface FormulaSuggestions {
  readonly commands: readonly TexCommand[];
  /** Sanitized HTML for a short formula typeset with the preview's options, for a suggestion's preview. */
  readonly typeset: (tex: string) => Promise<string | undefined>;
}

const COMMAND_BEFORE_CARET = /\\[A-Za-z]*$/;
const MAX_SUGGESTIONS = 50;
const EXAMPLE_ARGUMENTS = ['a', 'b', 'c'];
const PREVIEW_CLASS = 'cm-formula-suggestion-preview';

/** The command with letters for its arguments, as its suggestion shows it typeset. */
export function commandExample({ name, argumentCount }: TexCommand): string {
  const examples = EXAMPLE_ARGUMENTS.slice(0, argumentCount).map((argument) => `{${argument}}`);
  return `\\${name}${examples.join('')}`;
}

/**
 * The commands that start with what was typed after the backslash, those matching its case first,
 * each group in the list's order.
 */
export function matchingCommands(commands: readonly TexCommand[], typed: string): readonly TexCommand[] {
  const lowerTyped = typed.toLowerCase();
  const sameCase = commands.filter(({ name }) => name.startsWith(typed));
  const otherCase = commands.filter(
    ({ name }) => !name.startsWith(typed) && name.toLowerCase().startsWith(lowerTyped),
  );
  return [...sameCase, ...otherCase];
}

function applyCommand(command: TexCommand) {
  // CodeMirror passes the view, the completion and the range the completion replaces.
  return (view: EditorView, ...[, from, to]: readonly [Completion, number, number]) => {
    const placeholders = '{#{}}'.repeat(command.argumentCount);
    view.dispatch(
      snippetInsertion(view.state, { from, to }, () => texWithFields(`\\${command.name}${placeholders}`)),
    );
  };
}

function suggestionSource(commands: readonly TexCommand[], commandOfLabel: Map<string, TexCommand>) {
  return (context: CompletionContext): CompletionResult | null => {
    const typed = context.matchBefore(COMMAND_BEFORE_CARET);
    if (!typed) return null;
    const options = matchingCommands(commands, typed.text.slice(1))
      .slice(0, MAX_SUGGESTIONS)
      .map((command): Completion => {
        const label = `\\${command.name}`;
        commandOfLabel.set(label, command);
        return { label, type: 'function', apply: applyCommand(command) };
      });
    return options.length > 0 ? { from: typed.from, options, filter: false } : null;
  };
}

function previewOf(command: TexCommand | undefined, suggestions: FormulaSuggestions): Node | null {
  if (!command) return null;
  const preview = document.createElement('span');
  preview.className = PREVIEW_CLASS;
  // The suggestion is named by its command; the typeset preview is only seen.
  preview.setAttribute('aria-hidden', 'true');
  void suggestions.typeset(commandExample(command)).then((html) => {
    if (html !== undefined) preview.innerHTML = html;
  });
  return preview;
}

/** Suggests the supported commands after a backslash, each named by the command and shown typeset. */
export function formulaSuggestions(suggestions: FormulaSuggestions): Extension {
  const commandOfLabel = new Map<string, TexCommand>();
  return autocompletion({
    override: [suggestionSource(suggestions.commands, commandOfLabel)],
    icons: false,
    addToOptions: [
      { render: (completion) => previewOf(commandOfLabel.get(completion.label), suggestions), position: 80 },
    ],
  });
}
