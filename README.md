# MDX - Markdown Explorer

A fast, private Markdown viewer for Windows. Built with Tauri and TypeScript, so macOS, Linux and a browser extension can follow.

> **Status:** early development. The first release targets Windows 10 (22H2) and Windows 11, x64 and arm64.

## Features (first release)

- **Tabs**: open many documents, reorder, pin, and pick up where you left off after a restart.
- **Favourites**: star files and folders for one-click access, even on network shares.
- **Recent files**: the last 25 documents, with pinning and Jump List support.
- **Open from anywhere**: local disks, network shares (`\\server\share`), mapped drives and OneDrive folders.
- **GitHub-flavored Markdown**: tables, task lists, syntax highlighting, outline, live reload when the file changes.
- **Comfortable reading**: light, dark and high-contrast themes, zoom, reading width, find in page.
- **Accessible**: full keyboard operation and screen-reader support.

## Privacy

MDX doesn't collect or send any data. There's no telemetry, no analytics and no account. The first release makes **no network connections at all**. Favourites, recent files and open tabs are stored only on your PC, in `%APPDATA%\getaxtools\MDX`.

## Install

Releases will be published on [GitHub Releases](https://github.com/getaxtools/mdx/releases) and through winget:

```powershell
winget install getaxtools.MDX
```

Every release is code-signed and ships with `SHA256SUMS.txt`, a software bill of materials and build provenance. To verify a download:

```powershell
Get-FileHash .\MDX-<version>-windows-x64-setup.exe -Algorithm SHA256
gh attestation verify .\MDX-<version>-windows-x64-setup.exe --repo getaxtools/mdx
```

## Build from source

Prerequisites: [Rust](https://rustup.rs) (the version in `rust-toolchain.toml`), [Node.js](https://nodejs.org) (the version in `.node-version`) with pnpm enabled (`corepack enable`), [just](https://just.systems), and the [Tauri prerequisites for Windows](https://v2.tauri.app/start/prerequisites/) (Microsoft C++ Build Tools and WebView2).

```powershell
just setup   # install dependencies
just dev     # run the app
just check   # run every check CI runs
```

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODING-STANDARDS.md](CODING-STANDARDS.md) first. Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

Copyright (c) 2026 getaxtools.

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or [MIT license](LICENSE-MIT), at your option. Unless you explicitly state otherwise, any contribution you intentionally submit for inclusion in this project shall be dual-licensed as above, without any additional terms or conditions.
