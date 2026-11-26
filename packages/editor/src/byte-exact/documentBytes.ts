import { withDocumentLineBreaks } from '@mdx/core';
import type { LineEnding } from '@mdx/platform';

/** A UTF-8 document as the app opens it: the text without its byte order mark, and how it was stored. */
export interface OpenedDocumentBytes {
  readonly text: string;
  readonly hasByteOrderMark: boolean;
  readonly lineEnding: LineEnding;
}

const UTF8_BYTE_ORDER_MARK = [...new TextEncoder().encode('﻿')];

/** Decodes as the desktop app's reader does for UTF-8, keeping every character exactly as stored. */
export function openDocumentBytes(bytes: Uint8Array): OpenedDocumentBytes {
  const hasByteOrderMark = UTF8_BYTE_ORDER_MARK.every((byte, index) => bytes[index] === byte);
  const content = hasByteOrderMark ? bytes.subarray(UTF8_BYTE_ORDER_MARK.length) : bytes;
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content);
  return { text, hasByteOrderMark, lineEnding: lineEndingOf(text) };
}

/** The bytes a save writes for the editor's text: the document's line breaks, then its byte order mark. */
export function savedDocumentBytes(editedText: string, opened: OpenedDocumentBytes): Uint8Array {
  const text = withDocumentLineBreaks(editedText, opened.lineEnding, opened.text);
  const encoded = new TextEncoder().encode(text);
  return opened.hasByteOrderMark ? new Uint8Array([...UTF8_BYTE_ORDER_MARK, ...encoded]) : encoded;
}

/** The same detection as the desktop app's reader. */
function lineEndingOf(text: string): LineEnding {
  const windowsBreaks = text.split('\r\n').length - 1;
  const unixBreaks = text.split('\n').length - 1 - windowsBreaks;
  if (windowsBreaks > 0 && unixBreaks > 0) return 'mixed';
  return windowsBreaks > 0 ? 'crlf' : 'lf';
}
