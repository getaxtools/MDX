# Coding standards

MDX values **readability above everything else**. Someone who has never seen a file should understand it from its names alone. Each rule below lists the check that enforces it, so you get feedback before review.

## 1. Naming

| Rule                                                                                                   | Enforced by                                                                    |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Names reveal intent: `loadRecentFiles`, `canonicalDocumentPath`, `FavouritesList`                      | review                                                                         |
| Functions are verbs, booleans are questions (`isPinned`, `hasUnsavedChanges`), collections are plurals | ESLint `@typescript-eslint/naming-convention`, review                          |
| No abbreviations except universal ones (`url`, `id`, `html`, `ui`). Not `doc`, `cfg`, `mgr`, `tmp`     | review                                                                         |
| No dumping-ground modules: no `utils`, `helpers`, `common`, `misc`, `manager`                          | source hygiene check (`scripts/check-source-hygiene.mjs`, part of `just lint`) |
| Units in names when ambiguous: `timeoutMs`, `maxSizeBytes`                                             | review                                                                         |
| Named constants instead of magic numbers: `MAX_RECENT_FILES = 25`                                      | ESLint `no-magic-numbers` (domain packages)                                    |

**Casing**

| Kind                       | TypeScript / Svelte                                                                                 | Rust               |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ------------------ |
| Types, classes, components | `PascalCase`                                                                                        | `PascalCase`       |
| Functions, variables       | `camelCase`                                                                                         | `snake_case`       |
| Constants                  | `UPPER_SNAKE_CASE`                                                                                  | `UPPER_SNAKE_CASE` |
| Files                      | named after the main export: `FavouritesList.ts`, `TabStripView.svelte`, `canonicalDocumentPath.ts` | `snake_case.rs`    |
| Folders                    | `kebab-case`                                                                                        | `snake_case`       |
| Message keys               | `feature.area.purpose`                                                                              | -                  |

## 2. Comments

**Default: no comment.** If code needs a comment to be understood, rename something or extract a function.

A comment is allowed only for a _why_ the code can't express:

```ts
// WebView2 fires a second focus event after a native file dialog closes.
```

```rust
// Keys are case-folded because Windows paths are case-insensitive.
```

Not allowed:

- comments that restate the code (`// loop through tabs`)
- section banners (`// ===== Helpers =====`)
- commented-out code
- `TODO` without an issue number (`// TODO(#42): ...` is fine)
- authorship or change history (git has it)
- multi-paragraph explanations; split the code instead

Public package APIs may have a one-line doc comment when the name alone isn't enough.

Enforced by: the source hygiene check (TODO without an issue number) and review. Reviewers ask for comments to be removed as often as for code to be changed.

## 3. Functions and modules

| Rule                                                                                       | Enforced by                                                       |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| One function does one thing; ≤ 40 lines                                                    | ESLint `max-lines-per-function`                                   |
| ≤ 3 parameters; use an options object beyond that                                          | ESLint `max-params`, clippy `too_many_arguments`                  |
| Return early; nesting depth ≤ 3                                                            | ESLint `max-depth`                                                |
| Cyclomatic complexity ≤ 10                                                                 | ESLint `complexity`, clippy `cognitive_complexity`                |
| No boolean flag parameters that switch behavior; write two functions or use a named option | review                                                            |
| TypeScript `strict`; no `any`; no non-null `!` without a guard                             | `tsc --strict`, ESLint `no-explicit-any`, `no-non-null-assertion` |
| Rust: no `unwrap()`/`expect()` outside tests and `main` setup                              | clippy `unwrap_used`, `expect_used`                               |
| Errors are typed and carry a message key, never raw English for the UI                     | review                                                            |

## 4. Structure

Feature-first. Everything for a feature is easy to find by its name:

```
packages/core/src/favourites/          domain logic + unit tests
packages/ui/src/features/favourites/   views + component tests
apps/desktop/src-tauri/src/storage/    Rust persistence
tests/e2e/desktop/favourites/          UI tests
```

| Rule                                                                                                                | Enforced by                                                   |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| One concept per file; file named after its main export                                                              | review                                                        |
| `index.ts` only at a package's public boundary                                                                      | ESLint `no-restricted-imports` (deep imports across packages) |
| Dependencies point one way: `ui -> core -> platform` interfaces. `core` never imports Svelte, Tauri or browser APIs | ESLint `import/no-restricted-paths`                           |
| Anything that touches the OS goes behind an interface in `packages/platform`                                        | `import/no-restricted-paths`, review                          |
| Windows-specific Rust code lives only in `src-tauri/src/platform/windows/`                                          | review, cross-target `cargo check` in CI                      |

## 5. Tests

**Every feature ships with tests. A PR without tests isn't mergeable.**

| Layer            | Tool                     | Location                                         |
| ---------------- | ------------------------ | ------------------------------------------------ |
| TypeScript unit  | Vitest                   | next to the code: `FavouritesList.test.ts`       |
| Svelte component | Vitest + Testing Library | next to the component: `TabStripView.test.ts`    |
| Rust unit        | cargo-nextest            | `#[cfg(test)] mod tests` in the same file        |
| Rust integration | cargo-nextest            | `apps/desktop/src-tauri/tests/`                  |
| UI (end-to-end)  | WebdriverIO              | `tests/e2e/desktop/<feature>/<behavior>.spec.ts` |
| Fixtures         | -                        | `tests/fixtures/` (synthetic data only)          |

Rules:

1. **Names describe behavior**: `it('keeps only the 25 most recent files')`, `fn treats_paths_case_insensitively()`, `restores-tabs-after-restart.spec.ts`.
2. **Arrange, act, assert**, separated by blank lines; one behavior per test.
3. **Use the in-memory fakes** from `packages/platform` instead of mocking modules.
4. **Deterministic**: no network, a fake clock, a fixed locale, a temporary data folder per test.
5. **UI tests select by role and accessible name** (`getByRole('tab', { name: 'README.md' })`), never by CSS class.
6. **No sleeps**; wait for state.
7. **Readable over DRY.** Repetition in tests is fine when it makes each test stand alone.

Coverage gates (CI): ≥ 85% line coverage for domain packages and Rust file/storage code; 100% branch coverage for the HTML sanitizer and path canonicalization; coverage may not drop in a PR.

Flaky tests are bugs: tag them `@flaky`, open an issue, and fix within a week. Never hide flakiness with retries.

## 6. Security and privacy

| Rule                                                                               | Enforced by                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------- |
| Every rendered document goes through the shared HTML sanitizer. No bypasses        | security tests in `tests/security/`, review |
| Strict Content Security Policy: no `unsafe-eval`, no remote origins                | config test                                 |
| Rust commands validate every argument; paths are canonicalized before use          | Rust tests, review                          |
| No network calls (first release)                                                   | UI test with a network guard                |
| No new dependency without a reason (size, license, maintenance)                    | review                                      |
| Allowed licenses: MIT, Apache-2.0, BSD-2/3-Clause, ISC, Zlib, MPL-2.0, Unicode-3.0 | `cargo deny`, license check in `just audit` |
| No known High/Critical advisories                                                  | `cargo deny`, `pnpm audit`, `osv-scanner`   |
| No secrets, personal data or real user documents in the repo                       | gitleaks in CI, review                      |

## 7. User interface

| Rule                                                                   | Enforced by                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| No hard-coded user-visible text; use message keys                      | UI-text check (`scripts/check-ui-text.mjs`, part of `just lint`), review |
| Keyboard-operable with visible focus; accessible name on every control | axe in UI tests, component tests                                         |
| Windows shortcut conventions (Ctrl+O, Ctrl+W, Ctrl+Tab, F5, ...)       | shortcut table test                                                      |
| Colors, spacing and typography only via design tokens                  | Stylelint `declaration-strict-value`                                     |
| Light, dark and Windows contrast themes all work                       | visual tests                                                             |
| Motion uses opacity/transform only and respects reduced motion         | Stylelint, review                                                        |

## 8. Formatting

Formatting is automatic; don't argue with the formatter.

- TypeScript, Svelte, JSON, Markdown, YAML: Prettier (`.prettierrc.json`).
- Rust: rustfmt (`rustfmt.toml`).
- Line endings LF, UTF-8, final newline (`.editorconfig`, `.gitattributes`).

`just fmt` fixes everything; `just lint` checks it.
