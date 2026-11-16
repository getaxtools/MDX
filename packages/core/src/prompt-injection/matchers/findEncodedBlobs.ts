import { readableUtf8 } from '../decoders/decodeVariationSelectorPayload';
import { numberParameter, severityParameter } from '../Ruleset';
import { hasInstructionPhrase } from './findInstructionPhrases';
import type { DocumentRuleInput, RuleMatch } from './RuleMatch';

const RULE_ID = 'exfil-encoded-blob';
const HEXADECIMAL = 16;
const BASE64_BLOCK_LENGTH = 4;
const WEB_ADDRESS = /https?:\/\//i;
const DATA_URI_BEFORE = /data:[\w/+.-]+;base64,$/i;
const DATA_URI_LOOKBEHIND = 100;

interface EncodedBlob {
  readonly from: number;
  readonly to: number;
  readonly decoded: string;
}

function bytesOfBinaryString(binary: string): Uint8Array {
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeBase64(encoded: string): string | undefined {
  const standard = encoded.replaceAll('-', '+').replaceAll('_', '/');
  const padded = standard.padEnd(Math.ceil(standard.length / BASE64_BLOCK_LENGTH) * BASE64_BLOCK_LENGTH, '=');
  try {
    return readableUtf8(bytesOfBinaryString(atob(padded)));
  } catch {
    return undefined;
  }
}

function decodeHex(encoded: string): string | undefined {
  if (encoded.length % 2 !== 0) return undefined;
  const pairs = encoded.match(/../g) ?? [];
  return readableUtf8(Uint8Array.from(pairs, (pair) => Number.parseInt(pair, HEXADECIMAL)));
}

function decodePercent(encoded: string): string | undefined {
  try {
    const decoded = decodeURIComponent(encoded);
    return readableUtf8(new TextEncoder().encode(decoded));
  } catch {
    return undefined;
  }
}

function blobsOf(
  text: string,
  pattern: RegExp,
  decode: (encoded: string) => string | undefined,
): EncodedBlob[] {
  return [...text.matchAll(pattern)].flatMap((match) => {
    const before = text.slice(Math.max(0, match.index - DATA_URI_LOOKBEHIND), match.index);
    if (DATA_URI_BEFORE.test(before)) return [];
    const decoded = decode(match[0]);
    return decoded === undefined ? [] : [{ from: match.index, to: match.index + match[0].length, decoded }];
  });
}

/** Base64, hexadecimal and percent-encoded runs that decode to readable text; hashes and keys decode to binary. */
export function findEncodedBlobs(input: DocumentRuleInput): RuleMatch[] {
  const rule = input.ruleset.rule(RULE_ID);
  const base64 = new RegExp(
    `[A-Za-z0-9+/_-]{${String(numberParameter(rule, 'minBase64Length'))},}={0,2}`,
    'g',
  );
  const hex = new RegExp(`\\b[0-9a-fA-F]{${String(numberParameter(rule, 'minHexLength'))},}\\b`, 'g');
  const percent = new RegExp(
    `(?:%[0-9A-Fa-f]{2}){${String(numberParameter(rule, 'minPercentEncodedCharacters'))},}`,
    'g',
  );
  const blobs = [
    ...blobsOf(input.text, base64, decodeBase64),
    ...blobsOf(input.text, hex, decodeHex),
    ...blobsOf(input.text, percent, decodePercent),
  ];
  return blobs.map((blob) => {
    const isSteering = hasInstructionPhrase(input, blob.decoded) || WEB_ADDRESS.test(blob.decoded);
    return {
      ruleId: RULE_ID,
      from: blob.from,
      to: blob.to,
      severity: isSteering ? severityParameter(rule, 'decodedInstructionSeverity') : rule.severity,
      context: { isHidden: input.hiddenRegions.contains(blob.from) },
      decoded: blob.decoded,
    };
  });
}
