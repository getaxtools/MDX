# Exact-bytes documents

Saving these documents after any number of mode switches must give back the same bytes. Git keeps them as they are (`-text` in `.gitattributes`), so their byte order marks and line breaks survive checkout. They live outside `documents/`, which the desktop UI tests copy and list. Every file is synthetic.

| File | Exercises |
|---|---|
| `crlf-with-bom.md` | CRLF line breaks with a UTF-8 byte order mark, setext headings, `_emphasis_`, `1)` list markers, a table, math next to a price, decomposed accented letters |
| `mixed-line-endings.md` | CRLF and LF breaks in one file, task markers, display math |
| `tabs-and-trailing-spaces.md` | tabs in text and in indented code, trailing spaces and a trailing tab, a hard break, no final line break |
| `references-and-html.md` | CRLF without a byte order mark, front matter, reference links, an HTML block, an HTML comment |
| `bidirectional-and-decomposed.md` | a UTF-8 byte order mark, Arabic and Hebrew text, mixed directions, decomposed letters, emoji joined with zero-width joiners, Japanese |
