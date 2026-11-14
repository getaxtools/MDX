/** Remembers each document's word count when it is first shown, to tell how many words this session added. */
export class SessionWordCounts {
  private readonly startingWords = new Map<string, number>();

  /** Words added since the document was first shown; negative when more were removed. */
  changeSince(canonicalKey: string, words: number): number {
    const startingWords = this.startingWords.get(canonicalKey);
    if (startingWords === undefined) {
      this.startingWords.set(canonicalKey, words);
      return 0;
    }
    return words - startingWords;
  }
}
