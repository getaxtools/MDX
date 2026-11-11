<p align="center">
  <img src=".github/assets/logo.svg" alt="MDX - Markdown Explorer logo" width="112" height="112">
</p>

<h1 align="center">MDX - Markdown Explorer</h1>

<p align="center">
  <strong>A free, open-source Markdown viewer and editor for Windows.</strong><br>
  Open <code>.md</code> files in tabs, keep favourites, edit with a live preview and work offline. No telemetry, no account.
</p>

<p align="center">
  <a href="https://github.com/getaxtools/MDX/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/getaxtools/MDX?label=download&color=2ea44f"></a>
  <a href="https://github.com/getaxtools/MDX/actions/workflows/ci.yml"><img alt="CI status" src="https://github.com/getaxtools/MDX/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/getaxtools/MDX"><img alt="OpenSSF Scorecard" src="https://api.scorecard.dev/projects/github.com/getaxtools/MDX/badge"></a>
  <a href="#license"><img alt="License: MIT OR Apache-2.0" src="https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue"></a>
  <img alt="Platform: Windows 10 and 11" src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D4">
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#download-and-install">Download</a> ·
  <a href="#your-data-stays-on-your-pc">Privacy</a> ·
  <a href="#keyboard-shortcuts">Shortcuts</a> ·
  <a href="#faq">FAQ</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-reduced-motion: reduce)" srcset=".github/assets/screenshot-light.png">
    <img alt="MDX - Markdown Explorer in action: Markdown documents open in tabs with a favourites and folders sidebar, math and syntax highlighting, the outline panel, the command palette, a document in eight scripts, the editor with a live preview beside it, the dark theme and Find in Folders" src=".github/assets/hero.gif" width="900">
  </picture>
</p>

**MDX - Markdown Explorer** is a fast **Markdown viewer and editor for Windows 10 and Windows 11**. Open `.md` files from your PC, network shares or OneDrive folders, keep them in tabs, star the ones you use every day and pick up exactly where you left off. It renders **GitHub-flavoured Markdown** with syntax highlighting and math, edits Markdown with a live preview beside it, and displays every script, from Hindi, Telugu, Kannada and Tamil to Japanese, Chinese, Korean and Arabic. MDX works fully offline and never sends your data anywhere. Built with [Tauri](https://tauri.app), Rust and Svelte, it uses the WebView2 runtime that already ships with Windows, so it stays small.

<p align="center">
  <a href="https://github.com/getaxtools/MDX/releases/latest"><strong>Download MDX for Windows</strong></a>
</p>

## Features

### Read Markdown the way it was meant to look

- **GitHub-flavoured Markdown.** Tables, task lists, strikethrough, autolinks and heading anchors that match GitHub.
- **Extended syntax.** Footnotes, definition lists, GitHub alerts, emoji shortcodes, highlights, abbreviations, subscript and superscript.
- **Syntax highlighting** for code blocks, with a copy button on each one.
- **Math** typeset with KaTeX, loaded only when a document uses it.
- **Front matter** shown as a tidy properties panel instead of raw YAML.
- **Relative images and links** between documents, so a folder of notes works like a small website.
- **Outline and breadcrumbs** that follow the section you are reading.
- **Live reload.** When another program changes a file, MDX shows the new version straight away.

### Keep every document within reach

- **Tabs that survive restarts.** Pin, reorder and reopen tabs. Your tabs and the active document come back the next time you start MDX.
- **Favourites.** Star documents and folders with <kbd>Ctrl</kbd>+<kbd>D</kbd>, sort them into groups, and export or import them as JSON.
- **Recent files.** Your last 25 documents, which you can pin, also under **File > Open Recent**.
- **Explorer.** Browse opened folders in a tree that updates when files are added, renamed or removed.
- **Command palette.** Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> to open any document by name or run any command.
- **Open from anywhere.** Use the Open dialog, drag and drop, double-click in File Explorer or the command line. Local folders, network shares (`\\server\share`), mapped drives and OneDrive folders all work, and a slow share never freezes the window.
- **One window.** Open another `.md` file while MDX is running and it appears as a new tab in the same window.
- **Back and forward** between documents, a start page and resizable side panels.

### Edit Markdown with a live preview

- **Source editor** with Markdown formatting shortcuts, find and replace, undo and redo.
- **Preview beside the editor** that scrolls with it (<kbd>Ctrl</kbd>+<kbd>\\</kbd>).
- **Safe saving.** Save, Save As and Save All keep the original encoding and line endings, and MDX warns you before overwriting changes made by another program.
- **Paste a table from Excel.** Copy cells in Excel and paste them as a Markdown table with <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd>.

### Find anything

- **Find in document** with Match Case and Match Whole Word.
- **Find in Folders** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>) searches every document in your opened and favourite folders.

### Print, export and share

- **Print** with <kbd>Ctrl</kbd>+<kbd>P</kbd>, or choose Microsoft Print to PDF to save a PDF.
- **Export** a document as standalone HTML or plain text.
- **Copy as HTML** pastes formatted text into Word, Outlook or any email.

### Make it yours

- **Light, dark or system theme**, zoom, reading width, and GitHub, Book or Academic typography.
- **16 interface languages**: English, Arabic, Bengali, Chinese (Simplified), French, German, Hindi, Japanese, Kannada, Korean, Marathi, Portuguese (Brazil), Russian, Spanish, Tamil and Telugu, with a right-to-left layout for Arabic.
- **Keyboard first.** Standard Windows shortcuts are shown in every menu, and <kbd>F1</kbd> lists them all.
- **Full screen** reading with <kbd>F11</kbd>.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/screenshot-dark.png">
    <source media="(prefers-color-scheme: light)" srcset=".github/assets/screenshot-light.png">
    <img alt="MDX - Markdown Explorer showing a team handbook with favourites, folders and recent files in the sidebar, a tip alert, a task list and a table" src=".github/assets/screenshot-light.png" width="900">
  </picture>
</p>

### Every script, every encoding

Indic scripts, Chinese, Japanese, Korean and right-to-left text render with the right fonts and direction. UTF-8, UTF-16 and legacy encodings such as Shift_JIS are detected automatically, and **Reopen with Encoding** fixes a file that was saved in an older code page.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/scripts-dark.png">
    <source media="(prefers-color-scheme: light)" srcset=".github/assets/scripts-light.png">
    <img alt="A Markdown table rendered in MDX with greetings in Hindi, Telugu, Kannada, Tamil, Japanese, Chinese, Korean and Arabic" src=".github/assets/scripts-light.png" width="900">
  </picture>
</p>

### Safe by design

Every document is treated as untrusted. Scripts, event handlers, iframes, remote images and dangerous links are removed before anything is shown, and links never navigate the app away. Web links open in your browser only after you confirm.

## Your data stays on your PC

- **No telemetry, analytics or crash uploads.** MDX doesn't collect anything about you or your documents.
- **No network connections.** The current version never connects to the internet. The app's [Content Security Policy](apps/desktop/src-tauri/tauri.conf.json) only allows local communication, and the window has [three narrow permissions](apps/desktop/src-tauri/capabilities/main-window.json).
- **No account.** Nothing to sign up for.
- **Local storage only.** Tabs, favourites and recent files are saved in `%APPDATA%\getaxtools\MDX` on your PC.

## Download and install

1. Download the installer for your PC from the [latest release](https://github.com/getaxtools/MDX/releases/latest): `MDX-<version>-windows-x64-setup.exe` for most PCs, or `MDX-<version>-windows-arm64-setup.exe` for Arm devices such as Surface Pro X and Copilot+ PCs.
2. Run it. MDX installs for your Windows account only, so no administrator rights are needed.
3. The installers are not code-signed yet, so Windows SmartScreen may warn about an unrecognised app. Select **More info**, then **Run anyway**.

Every release includes `SHA256SUMS.txt`, a software bill of materials and build provenance. To check a download, compare its SHA-256 hash with `SHA256SUMS.txt`, or run `gh attestation verify <file> --repo getaxtools/MDX`.

**Requirements:** Windows 10 (22H2) or Windows 11, x64 or arm64, with the Microsoft Edge WebView2 Runtime (included in Windows 11 and current Windows 10).

| Channel                                                       | Status    |
| ------------------------------------------------------------- | --------- |
| [GitHub Releases](https://github.com/getaxtools/MDX/releases) | Available |
| [Build from source](#build-from-source)                       | Available |
| winget                                                        | Planned   |

## Keyboard shortcuts

| Action                        | Shortcut                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Open documents                | <kbd>Ctrl</kbd>+<kbd>O</kbd>                                                                                               |
| New document                  | <kbd>Ctrl</kbd>+<kbd>N</kbd>                                                                                               |
| Command palette               | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>                                                                              |
| Star or unstar the document   | <kbd>Ctrl</kbd>+<kbd>D</kbd>                                                                                               |
| Edit / preview                | <kbd>Ctrl</kbd>+<kbd>/</kbd>                                                                                               |
| Preview beside the editor     | <kbd>Ctrl</kbd>+<kbd>\\</kbd>                                                                                              |
| Save / Save As / Save All     | <kbd>Ctrl</kbd>+<kbd>S</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> / <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd> |
| Find / Find in Folders        | <kbd>Ctrl</kbd>+<kbd>F</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>                                               |
| Outline                       | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd>                                                                              |
| Explorer                      | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd>                                                                              |
| Source view                   | <kbd>Ctrl</kbd>+<kbd>U</kbd>                                                                                               |
| Next / previous tab           | <kbd>Ctrl</kbd>+<kbd>Tab</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Tab</kbd>                                           |
| Go to tab 1-8 / last tab      | <kbd>Ctrl</kbd>+<kbd>1</kbd>…<kbd>8</kbd> / <kbd>Ctrl</kbd>+<kbd>9</kbd>                                                   |
| Close tab / reopen closed tab | <kbd>Ctrl</kbd>+<kbd>W</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>                                               |
| Zoom in / out / reset         | <kbd>Ctrl</kbd>+<kbd>+</kbd> / <kbd>Ctrl</kbd>+<kbd>-</kbd> / <kbd>Ctrl</kbd>+<kbd>0</kbd>                                 |
| Back / forward                | <kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>Alt</kbd>+<kbd>→</kbd>                                                                  |
| Print                         | <kbd>Ctrl</kbd>+<kbd>P</kbd>                                                                                               |
| Settings                      | <kbd>Ctrl</kbd>+<kbd>,</kbd>                                                                                               |
| All keyboard shortcuts        | <kbd>F1</kbd>                                                                                                              |

## Roadmap

Planned, not yet available:

- Mermaid diagrams
- Code-signed installers and winget
- A Jump List for recent files and download progress for OneDrive files
- Rich text editing, comparing two documents, and highlights, comments and notes per document
- Workspaces
- macOS, Linux and a browser extension

Follow progress in [issues](https://github.com/getaxtools/MDX/issues) and suggest features with the [feature request form](https://github.com/getaxtools/MDX/issues/new?template=feature-request.yml).

## FAQ

### How do I open Markdown files on Windows?

Install MDX, then double-click any `.md` file, drag it onto the MDX window, or use **File > Open** (<kbd>Ctrl</kbd>+<kbd>O</kbd>). MDX opens `.md`, `.markdown`, `.mdown`, `.mkd` and `.mdx` files.

### How do I make MDX the default app for .md files?

Right-click a `.md` file in File Explorer, choose **Open with > Choose another app**, select **MDX - Markdown Explorer** and turn on **Always use this app**.

### Is MDX a Markdown editor or only a viewer?

Both. MDX opens documents for reading, and <kbd>Ctrl</kbd>+<kbd>/</kbd> switches to a source editor with formatting shortcuts. <kbd>Ctrl</kbd>+<kbd>\\</kbd> shows a live preview beside the editor.

### Is MDX related to the MDX format (JSX in Markdown)?

No. MDX - Markdown Explorer is a viewer and editor for plain Markdown. Files with the `.mdx` extension are shown as Markdown; embedded code is never executed.

### Is it free?

Yes. MDX is free and open source under the MIT or Apache-2.0 license, at your option.

### Does it work offline?

Yes. MDX never needs the internet, and the current version makes no network connections at all.

### Can I open files from network shares and OneDrive?

Yes. Use UNC paths such as `\\server\share\notes.md`, mapped drives or OneDrive folders. Files load in the background, and unreachable locations show a clear message instead of freezing the window.

### Does MDX support Mermaid diagrams?

Not yet. Math with KaTeX and syntax highlighting are supported today; Mermaid diagrams are on the [roadmap](#roadmap).

### Will there be macOS and Linux versions?

Yes, they are planned. MDX is built with Tauri, so the same code can run on all three platforms.

## Build from source

Prerequisites:

- [Rust](https://rustup.rs) (the version in `rust-toolchain.toml`)
- [Node.js](https://nodejs.org) (the version in `.node-version`) with pnpm enabled: `corepack enable`
- [just](https://just.systems)
- The [Tauri prerequisites for Windows](https://v2.tauri.app/start/prerequisites/): Microsoft C++ Build Tools and WebView2

```powershell
git clone https://github.com/getaxtools/MDX.git
cd MDX
just setup   # install dependencies
just dev     # run the app
just check   # run every check CI runs
```

## Contributing

Contributions are welcome, including translation fixes from native speakers. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODING-STANDARDS.md](CODING-STANDARDS.md) first. Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

Copyright (c) 2026 getaxtools.

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or [MIT license](LICENSE-MIT), at your option. Unless you explicitly state otherwise, any contribution you intentionally submit for inclusion in this project shall be dual-licensed as above, without any additional terms or conditions.

---

<p align="center">If MDX is useful to you, a ⭐ on GitHub helps other people find it.</p>
