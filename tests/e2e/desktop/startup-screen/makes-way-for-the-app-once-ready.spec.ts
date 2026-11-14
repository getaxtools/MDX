import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTranslator } from '@mdx/i18n';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const translator = createTranslator();

describe('the start-up screen', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('makes way for the app once its documents are restored', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['getting-started.md'] });

    await app.browser.$('[role="tab"][aria-selected="true"]').waitForDisplayed();
    await app.browser
      .$(`[role="progressbar"][aria-label="${translator.translate('startup.screen.label')}"]`)
      .waitForExist({ reverse: true });

    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
