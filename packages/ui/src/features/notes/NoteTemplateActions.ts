import {
  dailyNoteName,
  expandTemplate,
  kindDataWithNotesSettings,
  noteNameOf,
  notesLocationOf,
  notesSettingsOf,
  type NotesSettings,
  type ViewerSession,
} from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';
import { DocumentOpenError, type NoteFilesPort } from '@mdx/platform';

export type NoteTemplateCommand =
  | { readonly kind: 'openTodaysNote' }
  | { readonly kind: 'showNewNoteFromTemplate' }
  | { readonly kind: 'createNoteFromTemplate'; readonly template: string; readonly name: string }
  | { readonly kind: 'updateNotesSettings'; readonly settings: NotesSettings };

export const NOTE_TEMPLATE_COMMAND_KINDS: readonly NoteTemplateCommand['kind'][] = [
  'openTodaysNote',
  'showNewNoteFromTemplate',
  'createNoteFromTemplate',
  'updateNotesSettings',
];

export interface NoteTemplateActionsDependencies {
  readonly session: ViewerSession;
  readonly noteFiles: NoteFilesPort;
  readonly translator: Translator;
  readonly now: () => Date;
  readonly openDocument: (path: string) => Promise<void>;
  readonly openForEditing: (path: string) => Promise<void>;
  readonly showNotice: (key: MessageKey, values?: Readonly<Record<string, string>>) => void;
  readonly showTemplateDialog: () => void;
  readonly onNotesChanged: () => void;
}

/** Today's note, notes from templates, and the settings saying where both live. */
export class NoteTemplateActions {
  private templateNames: readonly string[] | undefined;

  constructor(private readonly dependencies: NoteTemplateActionsDependencies) {}

  /** The names of the templates, once New Note from Template was chosen. */
  templates(): readonly string[] | undefined {
    return this.templateNames;
  }

  async run(command: NoteTemplateCommand, location: string): Promise<void> {
    if (command.kind === 'openTodaysNote') await this.openTodaysNote(location);
    else if (command.kind === 'showNewNoteFromTemplate') await this.showTemplates(location);
    else if (command.kind === 'createNoteFromTemplate') await this.createFromTemplate(location, command);
    else await this.updateSettings(command.settings);
  }

  /** Made from the daily template the first time it is opened on a day, then opened as it is. */
  private async openTodaysNote(location: string): Promise<void> {
    const settings = this.settings();
    const name = dailyNoteName(settings, this.dependencies.now(), this.dependencies.translator.locale);
    const path = `${location}\\${settings.dailyFolder.replaceAll('/', '\\')}\\${name}.md`;
    const text = settings.dailyTemplate
      ? await this.templateText(location, settings.dailyTemplate, name)
      : '';
    try {
      const note = await this.dependencies.noteFiles.createNoteInFolder({
        location,
        folder: settings.dailyFolder,
        name,
        text,
      });
      this.dependencies.onNotesChanged();
      await this.dependencies.openForEditing(note.displayPath);
    } catch (error) {
      if (error instanceof DocumentOpenError && error.failure === 'nameTaken')
        await this.dependencies.openDocument(path);
      else this.showRefusal(error, name);
    }
  }

  private async showTemplates(location: string): Promise<void> {
    const folder = `${location}\\${this.settings().templatesFolder.replaceAll('/', '\\')}`;
    const listing = await this.dependencies.noteFiles
      .listFolder(folder)
      .catch(() => ({ folders: [], documents: [] }));
    const order = new Intl.Collator(this.dependencies.translator.locale, {
      numeric: true,
      sensitivity: 'base',
    });
    this.templateNames = listing.documents.map((note) => noteNameOf(note.fileName)).sort(order.compare);
    this.dependencies.showTemplateDialog();
  }

  private async createFromTemplate(
    location: string,
    { template, name }: { readonly template: string; readonly name: string },
  ): Promise<void> {
    const text = await this.templateText(location, template, name);
    try {
      const note = await this.dependencies.noteFiles.createNoteInFolder({ location, folder: '', name, text });
      this.dependencies.onNotesChanged();
      await this.dependencies.openForEditing(note.displayPath);
    } catch (error) {
      this.showRefusal(error, name);
    }
  }

  private async updateSettings(settings: NotesSettings): Promise<void> {
    const { session } = this.dependencies;
    const shown = session.shownWorkspace();
    if (!shown || !notesLocationOf(shown)) return;
    await session.updateWorkspaceKindData(shown.id, kindDataWithNotesSettings(shown.kindData, settings));
  }

  /** A template's text with its variables filled; a template that cannot be read leaves the note empty. */
  private async templateText(location: string, template: string, title: string): Promise<string> {
    const { noteFiles, now, translator } = this.dependencies;
    const path = `${location}\\${this.settings().templatesFolder.replaceAll('/', '\\')}\\${template}.md`;
    try {
      return expandTemplate(await noteFiles.readNote(path), { now: now(), locale: translator.locale, title });
    } catch {
      this.dependencies.showNotice('notes.templates.unreadable', { name: template });
      return '';
    }
  }

  private settings(): NotesSettings {
    return notesSettingsOf(this.dependencies.session.shownWorkspace());
  }

  private showRefusal(error: unknown, name: string): void {
    const key = error instanceof DocumentOpenError ? error.messageKey : 'errors.document.unreadable';
    this.dependencies.showNotice(key, { path: name });
  }
}
