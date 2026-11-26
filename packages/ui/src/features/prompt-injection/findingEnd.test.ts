import type { InjectionFinding } from '@mdx/core';
import { describe, expect, it } from 'vitest';
import { findingEnd } from './findingEnd';

function findingAt(text: string, from: number, to: number): InjectionFinding {
  const before = text.slice(0, from);
  const lines = before.split(/\r\n|\r|\n/);
  return {
    ruleId: 'hidden-html-comment',
    severity: 'info',
    from,
    to,
    line: lines.length - 1,
    column: lines.at(-1)?.length ?? 0,
    excerpt: '',
    messageArguments: {},
  };
}

describe('findingEnd', () => {
  it('ends on the same line for a finding inside one line', () => {
    const text = 'one\nab<!-- x -->cd';

    expect(findingEnd(text, findingAt(text, 6, 16))).toEqual({ line: 1, column: 12 });
  });

  it('counts CRLF, LF and a lone CR as one line break each', () => {
    const text = 'a<!--\r\nb\nc\rd-->e';

    expect(findingEnd(text, findingAt(text, 1, 15))).toEqual({ line: 3, column: 4 });
  });
});
