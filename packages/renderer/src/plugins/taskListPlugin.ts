import type { MarkdownIt, StateCore, Token } from 'markdown-it';

const TASK_MARKER = /^\[([ xX])\]\s+/;

interface TaskItem {
  readonly listItem: Token;
  readonly inline: Token;
  readonly firstText: Token;
  readonly marker: RegExpExecArray;
}

export function taskListPlugin(markdown: MarkdownIt): void {
  markdown.core.ruler.after('inline', 'mdx_task_lists', (state) => {
    state.tokens.forEach((_token, index) => {
      const taskItem = findTaskItem(state.tokens, index);
      if (taskItem) convertToCheckbox(state, taskItem);
    });
  });
}

function findTaskItem(tokens: readonly Token[], index: number): TaskItem | undefined {
  const listItem = tokens[index - 2];
  const inline = tokens[index];
  if (!listItem || !inline || !startsListItemParagraph(tokens, index)) return undefined;
  const firstText = inline.children?.[0];
  if (firstText?.type !== 'text') return undefined;
  const marker = TASK_MARKER.exec(firstText.content);
  return marker ? { listItem, inline, firstText, marker } : undefined;
}

function startsListItemParagraph(tokens: readonly Token[], index: number): boolean {
  return (
    tokens[index - 2]?.type === 'list_item_open' &&
    tokens[index - 1]?.type === 'paragraph_open' &&
    tokens[index]?.type === 'inline'
  );
}

function convertToCheckbox(state: StateCore, { listItem, inline, firstText, marker }: TaskItem): void {
  const isChecked = marker[1] !== ' ';
  const labelledCheckbox = htmlToken(
    state,
    `<label><input type="checkbox" disabled${isChecked ? ' checked' : ''}> `,
  );
  firstText.content = firstText.content.slice(marker[0].length);
  inline.children?.unshift(labelledCheckbox);
  inline.children?.push(htmlToken(state, '</label>'));
  listItem.attrJoin('class', 'task-list-item');
}

function htmlToken(state: StateCore, html: string): Token {
  const token = new state.Token('html_inline', '', 0);
  token.content = html;
  return token;
}
