set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

tauri_manifest := "apps/desktop/src-tauri/Cargo.toml"

# List all recipes
default:
    @just --list

# Install all dependencies
setup:
    pnpm install --frozen-lockfile
    cargo fetch --manifest-path {{ tauri_manifest }}

# Run the desktop app
dev:
    pnpm --filter @mdx/desktop tauri dev

# Run all unit tests (TypeScript and Rust)
test: test-ts test-rust

# Run TypeScript unit tests
test-ts:
    pnpm vitest run

# Build the web frontend that the desktop app embeds
build-frontend:
    pnpm --filter @mdx/desktop build:frontend

# Run Rust unit and integration tests
test-rust: build-frontend
    cargo nextest run --manifest-path {{ tauri_manifest }}

# Build the Windows installer
build:
    pnpm --filter @mdx/desktop tauri build

# Build the debug desktop app with the embedded UI test driver
build-ui-test-app:
    pnpm --filter @mdx/desktop tauri build --debug --no-bundle --features webdriver --config src-tauri/tauri.ui-test.conf.json

# Run UI tests against the desktop app
test-ui: build-ui-test-app
    pnpm test:ui

# Run unit tests whose path contains the feature name, e.g. just test-feature favourites
test-feature name:
    pnpm vitest run {{ name }}

# Run unit tests with coverage gates
coverage:
    pnpm test:coverage

# Lint, check formatting and type-check everything
lint: build-frontend
    pnpm lint
    pnpm typecheck
    cargo fmt --manifest-path {{ tauri_manifest }} --check
    cargo clippy --manifest-path {{ tauri_manifest }} --all-targets --all-features -- -D warnings

# Format all code in place
fmt:
    pnpm fmt
    cargo fmt --manifest-path {{ tauri_manifest }}

# Audit dependencies for vulnerabilities and licenses
audit:
    pnpm audit --audit-level high
    osv-scanner scan source --config osv-scanner.toml --recursive .
    cargo deny --manifest-path {{ tauri_manifest }} check

# Run everything CI runs
check: lint coverage test-rust test-ui
