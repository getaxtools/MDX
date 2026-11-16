export interface TopLevelYamlEntry {
  readonly key: string;
  /** The value on the key's own line, unquoted, or empty when the value is a block below it. */
  readonly value: string;
  /** Counted from 1. */
  readonly lineNumber: number;
}

const TOP_LEVEL_ENTRY = /^([A-Za-z_][\w.-]*)\s*:(?:\s+(.*))?$/;
const LINE_BREAK = /\r\n|\r|\n/;
const BYTE_ORDER_MARK = '\uFEFF';

function withoutComment(value: string): string {
  if (value.startsWith('"') || value.startsWith("'")) return value;
  const commentStart = value.search(/\s#/);
  return commentStart === -1 ? value : value.slice(0, commentStart);
}

function unquoted(value: string): string {
  const isQuoted =
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
  return isQuoted ? value.slice(1, -1) : value;
}

/**
 * The keys that start at the first column of a YAML file, with their one-line values. Nested blocks,
 * lists and multi-line text are skipped, so any file can be read without a YAML library.
 */
export function readTopLevelYamlEntries(text: string): TopLevelYamlEntry[] {
  const lines = text.replace(BYTE_ORDER_MARK, '').split(LINE_BREAK);
  return lines.flatMap((line, index) => {
    const match = TOP_LEVEL_ENTRY.exec(line);
    if (!match) return [];
    const value = unquoted(withoutComment((match[2] ?? '').trim()).trim());
    return [{ key: match[1] ?? '', value, lineNumber: index + 1 }];
  });
}

export function topLevelYamlValue(text: string, key: string): string | undefined {
  return readTopLevelYamlEntries(text).find((entry) => entry.key === key)?.value;
}
