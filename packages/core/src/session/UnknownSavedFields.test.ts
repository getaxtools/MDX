import { AppStateRefusedError, InMemoryAppState } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { restoreAppState, toPersistedAppState } from './persistedAppState';
import { UnknownSavedFields } from './UnknownSavedFields';

const FIELDS_OF_NEWER_VERSION = {
  boardLayout: { columns: ['Ideas', 'Done'], isCompact: true, widthsPx: [240, 320] },
  reviewReminders: [{ path: 'C:\\Notes\\Weekly.md', everyDays: 7 }],
  hasSeenTour: false,
};

const VIEW_SETTINGS_OF_NEWER_VERSION = {
  focusDimming: { isOn: true, strengthPercent: 40 },
  minimapSide: 'left',
};

class AppStateFailing extends InMemoryAppState {
  saveAttemptCount = 0;

  constructor(
    storedState: unknown,
    private readonly failureFor: (state: Record<string, unknown>) => Error | undefined,
  ) {
    super(storedState);
  }

  override save(state: unknown): Promise<void> {
    this.saveAttemptCount += 1;
    const failure = this.failureFor(state as Record<string, unknown>);
    return failure ? Promise.reject(failure) : super.save(state);
  }
}

function refusedWhenHolding(field: string) {
  return (state: Record<string, unknown>) => (field in state ? new AppStateRefusedError() : undefined);
}

function persistedEmptyState() {
  return toPersistedAppState(restoreAppState(undefined));
}

function rememberedFrom(saved: unknown): UnknownSavedFields {
  const unknownFields = new UnknownSavedFields();
  unknownFields.rememberFrom(JSON.parse(JSON.stringify(saved)));
  return unknownFields;
}

describe('UnknownSavedFields', () => {
  it('writes back the fields a newer version added unchanged', async () => {
    const saved = { ...persistedEmptyState(), ...FIELDS_OF_NEWER_VERSION };
    const unknownFields = rememberedFrom(saved);
    const appState = new InMemoryAppState();

    await unknownFields.saveWith(appState, persistedEmptyState());

    expect(JSON.parse(JSON.stringify(await appState.load()))).toEqual(saved);
  });

  it('writes back the view settings a newer version added unchanged', async () => {
    const persisted = persistedEmptyState();
    const saved = { ...persisted, view: { ...persisted.view, ...VIEW_SETTINGS_OF_NEWER_VERSION } };
    const unknownFields = rememberedFrom(saved);
    const appState = new InMemoryAppState();

    await unknownFields.saveWith(appState, persistedEmptyState());

    expect(JSON.parse(JSON.stringify(await appState.load()))).toEqual(saved);
  });

  it('writes its own value for every view setting it knows', async () => {
    const persisted = persistedEmptyState();
    const unknownFields = rememberedFrom({
      ...persisted,
      view: { ...persisted.view, theme: 'dark', minimapSide: 'left' },
    });

    const written = await unknownFields.saveWith(new InMemoryAppState(), persisted);

    expect(written.view).toEqual({ ...persisted.view, minimapSide: 'left' });
  });

  it('a save refused with the view settings a newer version added saves the state without them from then on', async () => {
    const persisted = persistedEmptyState();
    const unknownFields = rememberedFrom({
      ...persisted,
      view: { ...persisted.view, ...VIEW_SETTINGS_OF_NEWER_VERSION },
    });
    const appState = new AppStateFailing(undefined, (state) =>
      'minimapSide' in (state.view as object) ? new AppStateRefusedError() : undefined,
    );

    await unknownFields.saveWith(appState, persisted);
    await unknownFields.saveWith(appState, persisted);

    expect(await appState.load()).toEqual(persisted);
    expect(appState.saveAttemptCount).toBe(3);
  });

  it('keeps writing the fields it knows from its own state', async () => {
    const unknownFields = rememberedFrom({
      ...persistedEmptyState(),
      savedByAppVersion: '2.1.0',
      jumpListRemovals: { recentPaths: ['C:\\old.md'] },
      boardLayout: { columns: [] },
    });

    const written = await unknownFields.saveWith(new InMemoryAppState(), persistedEmptyState());

    expect(written).toEqual({ ...persistedEmptyState(), boardLayout: { columns: [] } });
  });

  it('keeps fields named like object properties as plain fields', async () => {
    const saved = JSON.parse(
      '{"schemaVersion":1,"__proto__":{"isPolluted":true},"constructor":1,"toString":2}',
    ) as unknown;
    const unknownFields = rememberedFrom(saved);

    const written = await unknownFields.saveWith(new InMemoryAppState(), persistedEmptyState());

    expect(JSON.parse(JSON.stringify(written))).toMatchObject({ constructor: 1, toString: 2 });
    expect(JSON.stringify(written)).toContain('"__proto__":{"isPolluted":true}');
    expect(Object.getPrototypeOf(written)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).isPolluted).toBeUndefined();
  });

  it('keeps nothing from state it cannot read', async () => {
    const unknownFields = rememberedFrom({ schemaVersion: 2, boardLayout: {} });

    const written = await unknownFields.saveWith(new InMemoryAppState(), persistedEmptyState());

    expect(written).not.toHaveProperty('boardLayout');
  });

  it('a save refused with the fields saves the state without them from then on', async () => {
    const unknownFields = rememberedFrom({ ...persistedEmptyState(), boardLayout: {} });
    const appState = new AppStateFailing(undefined, refusedWhenHolding('boardLayout'));

    await unknownFields.saveWith(appState, persistedEmptyState());
    await unknownFields.saveWith(appState, persistedEmptyState());

    expect(await appState.load()).toEqual(persistedEmptyState());
    expect(appState.saveCount).toBe(2);
  });

  it('a storage failure keeps the fields and is not retried without them', async () => {
    const unknownFields = rememberedFrom({ ...persistedEmptyState(), boardLayout: {} });
    const storageFailure = new Error('locked by another program');
    const failingAppState = new AppStateFailing(undefined, () => storageFailure);
    const appState = new InMemoryAppState();

    await expect(unknownFields.saveWith(failingAppState, persistedEmptyState())).rejects.toBe(storageFailure);
    await unknownFields.saveWith(appState, persistedEmptyState());

    expect(failingAppState.saveAttemptCount).toBe(1);
    expect(await appState.load()).toHaveProperty('boardLayout');
  });

  it('a save that fails without the fields too keeps them for the next save', async () => {
    const unknownFields = rememberedFrom({ ...persistedEmptyState(), boardLayout: {} });
    const failingAppState = new AppStateFailing(undefined, () => new AppStateRefusedError());
    const appState = new InMemoryAppState();

    await expect(unknownFields.saveWith(failingAppState, persistedEmptyState())).rejects.toBeInstanceOf(
      AppStateRefusedError,
    );
    await unknownFields.saveWith(appState, persistedEmptyState());

    expect(await appState.load()).toHaveProperty('boardLayout');
  });

  it('forgets the fields', async () => {
    const persisted = persistedEmptyState();
    const unknownFields = rememberedFrom({
      ...persisted,
      boardLayout: {},
      view: { ...persisted.view, minimapSide: 'left' },
    });

    unknownFields.forget();
    const written = await unknownFields.saveWith(new InMemoryAppState(), persisted);

    expect(written).toEqual(persisted);
  });
});
