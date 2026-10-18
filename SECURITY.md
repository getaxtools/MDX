# Security policy

## Supported versions

Only the latest release gets security fixes. Please update before reporting.

## Reporting a vulnerability

**Please don't open a public issue.** Report privately through GitHub: go to the repository's **Security** tab, then **Report a vulnerability**. That opens a private advisory only the maintainer can see.

Please include:

- the MDX version and Windows version
- what an attacker can do, and steps or a sample file that shows it
- whether you've shared the issue with anyone else

## What to expect

This is a personal open-source project maintained on a best-effort basis:

- acknowledgement within 7 days
- for confirmed issues, a fix target of 7 days for Critical and 30 days for High severity
- credit in the advisory and release notes, unless you prefer to stay anonymous

Please give us a reasonable chance to release a fix before disclosing publicly. We won't take legal action against good-faith research that respects users' privacy and doesn't degrade the service for others.

## Scope

In scope:

- the MDX desktop application and its installer
- the Markdown rendering pipeline (for example script execution or HTML injection through a crafted document)
- file access outside what the user opened

Out of scope:

- vulnerabilities in Windows, WebView2 or other third-party software that MDX doesn't control (report those upstream; tell us if MDX should mitigate)
- issues that require an attacker who already controls the user's account or machine

## How releases are protected

- Releases are code-signed and published with `SHA256SUMS.txt`, a software bill of materials (CycloneDX) and build provenance attestations.
- Every pull request runs dependency audits, static analysis (CodeQL) and the test suite, including a corpus of malicious Markdown documents.
- MDX makes no network connections in its first release and collects no data.
