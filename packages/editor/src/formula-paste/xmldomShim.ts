/**
 * Stands in for `@xmldom/xmldom`, which the MathML converter imports and which fails when
 * Object.prototype is frozen, as it is in the app. The bundler and the tests alias that package to
 * this module, which parses with the browser's own parser. Markup that is not well formed throws, as
 * that package does for a fatal error, and the converter then gives no TeX.
 */
export class DOMParser {
  parseFromString(source: string, mimeType: DOMParserSupportedType): Document {
    const document = new globalThis.DOMParser().parseFromString(source, mimeType);
    if (document.getElementsByTagName('parsererror').length > 0) {
      throw new SyntaxError('The MathML is not well formed');
    }
    return document;
  }
}
