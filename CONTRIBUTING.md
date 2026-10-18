# Contributing to MDX

Thanks for helping. This guide covers everything you need: setup, workflow, the Definition of Done and how reviews work. The code rules are in [CODING-STANDARDS.md](CODING-STANDARDS.md).

## Ground rules

- Everyone follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- **Privacy is a feature.** MDX never collects or sends user data. PRs that add telemetry, analytics or unexpected network calls won't be accepted.
- **Open an issue first** for features and larger changes, so we can agree on scope before you write code. Small fixes can go straight to a PR.
- The current focus is the first Windows release. Work outside that scope may wait.

## Setup

1. Install [Rust](https://rustup.rs), [Node.js](https://nodejs.org) (version in `.node-version`) and enable pnpm with `corepack enable`, [just](https://just.systems) and the [Tauri prerequisites for Windows](https://v2.tauri.app/start/prerequisites/).
2. Clone and set up:

   ```powershell
   git clone https://github.com/getaxtools/mdx.git
   cd mdx
   just setup
   ```

3. Run the app with `just dev`.

## Everyday commands

| Task                               | Command                        |
| ---------------------------------- | ------------------------------ |
| Run the app                        | `just dev`                     |
| All unit tests (TypeScript + Rust) | `just test`                    |
| UI tests                           | `just test-ui`                 |
| Tests for one feature              | `just test-feature favourites` |
| Lint, format check, type check     | `just lint`                    |
| Fix formatting                     | `just fmt`                     |
| **Everything CI checks**           | `just check`                   |
| Dependency and license audit       | `just audit`                   |

Run `just` with no arguments to list every recipe.

## Project tour

```
apps/desktop/          the Windows app (Tauri): UI entry and Rust backend in src-tauri/
packages/core/         domain logic, one folder per feature (tabs, favourites, recent-files, ...)
packages/platform/     interfaces for anything that touches the OS, plus in-memory fakes for tests
packages/renderer/     Markdown to safe HTML
packages/i18n/         message catalog (all user-visible text)
packages/ui/           design tokens, components and feature views
tests/                 UI tests, visual tests, security tests and shared fixtures
```

Start with the feature folder that matches your change: domain logic in `packages/core/src/<feature>/`, its view in `packages/ui/src/features/<feature>/`, its UI tests in `tests/e2e/desktop/<feature>/`.

## Workflow

1. Fork, then create a branch: `feat/tab-pinning`, `fix/unc-path-favourites`.
2. Make a small, focused change. Aim for under ~400 changed lines, excluding tests and fixtures.
3. Write tests alongside the code (see the Definition of Done).
4. Run `just check` locally.
5. Commit with a [Conventional Commit](https://www.conventionalcommits.org) message and a DCO sign-off (`git commit -s`).
6. Open a PR and fill in the template.

### Commit messages

```
feat(favourites): show unreachable state for offline network shares

Signed-off-by: Your Name <you@example.com>
```

Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`. The PR title must follow the same format, because it becomes the changelog entry when we squash-merge.

### Developer Certificate of Origin

Every commit must be signed off (`git commit -s`). That certifies you wrote the change or have the right to submit it under the project's licenses, as described at [developercertificate.org](https://developercertificate.org). There is no separate CLA.

## Definition of Done

A PR is ready for review when all of these are true:

- [ ] **Unit tests** cover the new or changed behavior, including failure cases. A bug fix includes a test that fails without the fix.
- [ ] **UI tests** cover user-facing changes, with an accessibility (axe) check.
- [ ] **No hard-coded user-visible text.** Strings go in `packages/i18n/locales/en.json`.
- [ ] **Keyboard and screen reader**: everything is reachable by keyboard, every control has an accessible name, and shortcuts follow Windows conventions.
- [ ] **Readable code** that follows [CODING-STANDARDS.md](CODING-STANDARDS.md): self-explanatory names, minimal comments.
- [ ] **No new network calls, permissions or capabilities** unless agreed in the issue.
- [ ] **`just check` passes.**
- [ ] Conventional Commit title and signed-off commits.

## Review process

1. **Triage**: the maintainer checks the linked issue and scope.
2. **CI**: every required check must pass. For first-time contributors, a maintainer approves the CI run first.
3. **Review**: correctness, tests, standards and, for changes to rendering, file access or the Rust backend, a security review. Expect questions; they're about the code, not about you.
4. **Merge**: squash merge with your PR title as the commit message.

Reviews aim to respond within a week. This is a personal project, so please be patient.

## AI-assisted contributions

AI coding tools are welcome, with these rules:

- **Disclose** meaningful AI assistance in the PR template.
- **You're accountable** for every line. You must understand the change and be able to explain it in review.
- **Same bar**: AI-written code meets the same tests, standards and review as any other code. Large, unreviewed generated changes will be closed.
- **No narration comments.** Delete the explanatory comments assistants tend to add; see the comment policy in CODING-STANDARDS.md.
- **Don't commit your assistant's configuration** or planning files. Common ones are already git-ignored.
- **Never paste secrets** or other people's private data into prompts.

## Adding UI text

All text goes through the message catalog:

1. Add a key to `packages/i18n/locales/en.json`, named `feature.area.purpose` (for example `favourites.sidebar.emptyState`).
2. Use ICU MessageFormat for plurals and variables: `"{count, plural, one {# file} other {# files}}"`.
3. Never build sentences by joining strings in code.

More languages are planned. When they arrive, translation PRs will follow the same flow.

## Reporting bugs and asking for features

Use the issue forms. For bugs, include your Windows version, MDX version, steps to reproduce and, if possible, a small sample Markdown file (no private data). For security problems, **don't open an issue**: follow [SECURITY.md](SECURITY.md).
