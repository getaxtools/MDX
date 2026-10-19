import type { MessageKey, Translator } from '@mdx/i18n';
import type { ContextMenuItem } from '../../components/ContextMenuItem';

/** WHATWG labels of the encodings a document can be reopened with, most common first. */
export const REOPEN_ENCODINGS = [
  'utf-8',
  'utf-16le',
  'utf-16be',
  'windows-1252',
  'iso-8859-15',
  'windows-1250',
  'iso-8859-2',
  'windows-1251',
  'koi8-r',
  'windows-1253',
  'windows-1254',
  'windows-1255',
  'windows-1256',
  'windows-874',
  'shift_jis',
  'euc-jp',
  'gb18030',
  'big5',
  'euc-kr',
] as const;

export type ReopenEncoding = (typeof REOPEN_ENCODINGS)[number];

/** The menu item for detecting the encoding again instead of using a chosen one. */
export const DETECT_ENCODING_ITEM = 'detect';

export type EncodingMenuItemId = ReopenEncoding | typeof DETECT_ENCODING_ITEM;

export function isReopenEncoding(label: string): label is ReopenEncoding {
  return (REOPEN_ENCODINGS as readonly string[]).includes(label);
}

export function encodingNameKey(encoding: ReopenEncoding): MessageKey {
  return `encoding.name.${encoding.replace(/[^a-z0-9]/g, '')}` as MessageKey;
}

export function encodingMenuItems(translator: Translator): ContextMenuItem<EncodingMenuItemId>[] {
  return [
    { id: DETECT_ENCODING_ITEM, label: translator.translate('encoding.detect') },
    ...REOPEN_ENCODINGS.map((encoding, index) => ({
      id: encoding,
      label: translator.translate(encodingNameKey(encoding)),
      hasSeparatorBefore: index === 0,
    })),
  ];
}
