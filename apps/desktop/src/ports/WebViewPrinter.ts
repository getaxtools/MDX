import type { DocumentPrinterPort } from '@mdx/platform';

export class WebViewPrinter implements DocumentPrinterPort {
  printActiveDocument(): void {
    window.print();
  }
}
