import { CodePointSet } from './CodePointSet';
import codepointNameData from './rules/codepoint-names.json' with { type: 'json' };

export interface HiddenCharacterName {
  /** The Unicode name or alias, such as ZERO WIDTH SPACE; a standard identifier, so never translated. */
  readonly name: string;
  readonly abbreviation: string;
}

interface NamedCodePoints extends HiddenCharacterName {
  readonly codePoints: CodePointSet;
}

/** Names for the invisible, control and direction characters that markers and chips show. */
export class HiddenCharacterNames {
  private static bundledNames: HiddenCharacterNames | undefined;

  private constructor(private readonly entries: readonly NamedCodePoints[]) {}

  static bundled(): HiddenCharacterNames {
    HiddenCharacterNames.bundledNames ??= new HiddenCharacterNames(
      codepointNameData.names.map(({ codepoints, name, abbreviation }) => ({
        codePoints: CodePointSet.fromNotations([codepoints]),
        name,
        abbreviation,
      })),
    );
    return HiddenCharacterNames.bundledNames;
  }

  nameOf(codePoint: number): HiddenCharacterName | undefined {
    const entry = this.entries.find(({ codePoints }) => codePoints.has(codePoint));
    return entry && { name: entry.name, abbreviation: entry.abbreviation };
  }

  namedCodePoints(): CodePointSet {
    return CodePointSet.union(this.entries.map(({ codePoints }) => codePoints));
  }
}
