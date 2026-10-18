# Malicious Markdown corpus

Every file here is rendered by `tests/security/sanitizer-corpus.test.ts`. The rendered output must contain no executable script, event handler, dangerous URL, embedded content, inline style, remote resource or clobbering name.

Add a file whenever a new attack vector is found or a sanitizer rule changes. Use `example.com` for any remote address.
