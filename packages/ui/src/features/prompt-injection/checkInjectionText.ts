import {
  runCharacterCheck,
  runInjectionCheck,
  type InjectionCheckRequest,
  type InjectionCheckResult,
} from '@mdx/core';
import { collectDocumentStructure } from '@mdx/renderer';

/** 10 MiB: above this, counted in UTF-16 code units, only the character rules run; the result says so. */
export const CHARACTERS_ONLY_LENGTH = 10_485_760;

/** Runs the check where it is called: inline for small documents, or inside the check worker. */
export function checkInjectionText(request: InjectionCheckRequest): InjectionCheckResult {
  if (isCheckedForCharactersOnly(request.text)) return runCharacterCheck(request);
  return runInjectionCheck(request, collectDocumentStructure(request.text));
}

export function isCheckedForCharactersOnly(text: string): boolean {
  return text.length > CHARACTERS_ONLY_LENGTH;
}
