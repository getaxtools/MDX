import { READING_WIDTHS, THEME_PREFERENCES, TYPOGRAPHIES, type ViewSettings } from '@mdx/core';
import type { Translator } from '@mdx/i18n';
import type { ContextMenuItem } from '../../components/ContextMenuItem';
import type { ViewerCommand } from '../viewer/viewerCommands';

export type ViewOptionMenuId = 'theme' | 'textWidth' | 'documentStyle';

export interface ViewOptionMenu {
  readonly id: ViewOptionMenuId;
  readonly label: string;
  readonly items: readonly ContextMenuItem<string>[];
  readonly commandFor: (choiceId: string) => ViewerCommand | undefined;
}

function choiceItems<Choice extends string>(
  choices: readonly Choice[],
  chosen: Choice,
  labelOf: (choice: Choice) => string,
): ContextMenuItem<Choice>[] {
  return choices.map((choice) => ({ id: choice, label: labelOf(choice), isChecked: choice === chosen }));
}

/** The Theme, Text Width and Document Style menus, each with the current choice checked. */
export function viewOptionMenus(settings: ViewSettings, translator: Translator): readonly ViewOptionMenu[] {
  return [
    {
      id: 'theme',
      label: translator.translate('menu.view.theme'),
      items: choiceItems(THEME_PREFERENCES, settings.theme, (theme) =>
        translator.translate(`menu.view.theme.${theme}`),
      ),
      commandFor: (choiceId) => {
        const theme = THEME_PREFERENCES.find((candidate) => candidate === choiceId);
        return theme && { kind: 'setTheme', theme };
      },
    },
    {
      id: 'textWidth',
      label: translator.translate('view.options.textWidth'),
      items: choiceItems(READING_WIDTHS, settings.readingWidth, (readingWidth) =>
        translator.translate(`menu.view.readingWidth.${readingWidth}`),
      ),
      commandFor: (choiceId) => {
        const readingWidth = READING_WIDTHS.find((candidate) => candidate === choiceId);
        return readingWidth && { kind: 'setReadingWidth', readingWidth };
      },
    },
    {
      id: 'documentStyle',
      label: translator.translate('view.options.documentStyle'),
      items: choiceItems(TYPOGRAPHIES, settings.typography, (typography) =>
        translator.translate(`menu.view.typography.${typography}`),
      ),
      commandFor: (choiceId) => {
        const typography = TYPOGRAPHIES.find((candidate) => candidate === choiceId);
        return typography && { kind: 'setTypography', typography };
      },
    },
  ];
}
