import { describe, expect, it } from 'vitest';
import { countTaskProgress, readTasks } from './countTaskProgress';

describe('countTaskProgress', () => {
  it('counts only x and X as done', () => {
    const text = ['- [x] 1.1', '- [ X] 1.2', '- [~] 1.3', '- [ ] 1.4'].join('\n');

    expect(countTaskProgress(text)).toEqual({ done: 2, total: 4 });
  });

  it.each([
    ['an empty checkbox', '- [] 1.1'],
    ['a dash checkbox', '- [-] 1.1'],
    ['a numbered item', '1. [ ] 1.1'],
    ['a parenthesis number', '2) [ ] 1.1'],
    ['a plus marker', '+ [ ] 1.1'],
    ['a star marker', '* [ ] 1.1'],
    ['an indented item', '    - [ ] 1.1'],
  ])('counts %s as an open task', (_, line) => {
    expect(countTaskProgress(line)).toEqual({ done: 0, total: 1 });
  });

  it.each([
    ['a link bullet', '- [A](https://example.com)'],
    ['a long bracket text', '- [Read me] first'],
    ['a line without a list marker', '[x] 1.1'],
    ['a checkbox without a space after the marker', '-[x] 1.1'],
    ['a heading', '## [x] Done'],
  ])('does not count %s', (_, line) => {
    expect(countTaskProgress(line)).toEqual({ done: 0, total: 0 });
  });

  it('reads Windows and old Mac line breaks', () => {
    expect(countTaskProgress('- [x] a\r\n- [ ] b\r- [X] c')).toEqual({ done: 2, total: 3 });
  });

  it('keeps each task line number and description', () => {
    const tasks = readTasks('# Tasks\r\n\r\n- [x] 1.1 Add the scan\r\n- [ ] 1.2 Add the read\r\n');

    expect(tasks).toEqual([
      { lineNumber: 3, isDone: true, description: '1.1 Add the scan' },
      { lineNumber: 4, isDone: false, description: '1.2 Add the read' },
    ]);
  });
});
