import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface TauriConfiguration {
  readonly app: {
    readonly security: {
      readonly csp: Readonly<Record<string, string>>;
      readonly devCsp: Readonly<Record<string, string>>;
      readonly freezePrototype?: boolean;
    };
  };
}

interface Capability {
  readonly windows: readonly string[];
  readonly permissions: readonly (string | { readonly identifier: string })[];
}

const TAURI_FOLDER = join(import.meta.dirname, '..', 'src-tauri');
const configuration = JSON.parse(
  readFileSync(join(TAURI_FOLDER, 'tauri.conf.json'), 'utf8'),
) as TauriConfiguration;
const { csp, devCsp } = configuration.app.security;
const NETWORK_SOURCE = /\b(https?|wss?):\/\/(?!ipc\.localhost|mdx-image\.localhost)|\*/;

describe('content security policy', () => {
  it('runs only the app’s own scripts, never eval or inline scripts', () => {
    expect(csp['script-src']).toBe("'self'");
    expect(Object.values(csp).join(' ')).not.toMatch(/unsafe-eval|wasm-unsafe-eval/);
    expect(csp['script-src']).not.toContain('unsafe-inline');
  });

  it('lets the page talk only to the app itself, never to the network', () => {
    expect(csp['connect-src']).toBe('ipc: http://ipc.localhost');
    for (const [directive, sources] of Object.entries(csp)) {
      expect(`${directive}: ${sources}`).not.toMatch(NETWORK_SOURCE);
    }
  });

  it('blocks plugins, frames, forms and base URL changes', () => {
    expect(csp['object-src']).toBe("'none'");
    expect(csp['frame-src']).toBe("'none'");
    expect(csp['form-action']).toBe("'none'");
    expect(csp['base-uri']).toBe("'none'");
  });

  it('adds only the development server connection in development', () => {
    expect({ ...devCsp, 'connect-src': csp['connect-src'] }).toEqual(csp);
    expect(devCsp['connect-src']).toBe('ipc: http://ipc.localhost ws://localhost:5173');
  });

  it('freezes JavaScript prototypes', () => {
    expect(configuration.app.security.freezePrototype).toBe(true);
  });
});

describe('main window capability', () => {
  it('grants only event listening and closing the window', () => {
    const capability = JSON.parse(
      readFileSync(join(TAURI_FOLDER, 'capabilities', 'main-window.json'), 'utf8'),
    ) as Capability;

    expect(capability.windows).toEqual(['main']);
    expect(capability.permissions).toEqual([
      'core:event:allow-listen',
      'core:event:allow-unlisten',
      'core:window:allow-destroy',
    ]);
  });
});
