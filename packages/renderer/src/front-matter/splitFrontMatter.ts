export interface SplitDocument {
  readonly frontMatter?: string;
  readonly body: string;
}

const FRONT_MATTER_FENCES = [
  { opening: '---', closings: ['---', '...'] },
  { opening: '+++', closings: ['+++'] },
];

export function splitFrontMatter(source: string): SplitDocument {
  const lines = source.split(/\r?\n/);
  const fence = FRONT_MATTER_FENCES.find(({ opening }) => lines[0]?.trimEnd() === opening);
  if (!fence) return { body: source };

  const closingIndex = lines.findIndex((line, index) => index > 0 && fence.closings.includes(line.trimEnd()));
  if (closingIndex === -1) return { body: source };

  return {
    frontMatter: lines.slice(1, closingIndex).join('\n'),
    body: lines.slice(closingIndex + 1).join('\n'),
  };
}
