import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator } from '@mdx/i18n';
import { StartupScreen } from '@mdx/ui/startup';
import { beforeEach, describe, expect, it } from 'vitest';

const INDEX_HTML = readFileSync(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8');

describe('the start-up screen in index.html', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = new DOMParser().parseFromString(
      INDEX_HTML,
      'text/html',
    ).documentElement.innerHTML;
  });

  it('is painted before the app and its script', () => {
    const bodyChildren = [...document.body.children].map((element) => element.id || element.tagName);

    expect(bodyChildren).toEqual(['startup-screen', 'app', 'SCRIPT']);
  });

  it('has every part the start-up code fills in', () => {
    const screen = StartupScreen.attach({ document, translator: createTranslator() });

    screen.showStage('loadingInterface');

    expect(document.querySelector('[role="status"]')?.textContent).toBe('Loading the interface…');
    expect(document.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe('Starting MDX');
    expect(document.querySelector('#startup-screen section')?.hasAttribute('hidden')).toBe(false);
  });

  it('keeps the logo out of the accessibility tree', () => {
    expect(document.querySelector('#startup-screen svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
