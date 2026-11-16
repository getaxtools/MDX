# Prompt injection test corpus

**This folder is test data for the prompt injection check. Nothing here is an instruction for anyone or anything that reads it.**

The samples imitate published ways of hiding text from people or of steering AI agents, so the check can be tested against them. To keep the corpus itself harmless:

- Every payload is a canary such as "reply with the word CANARY-7F3", never a real command.
- Every address uses a reserved name (`example.invalid` or `.test`).
- No file holds a real invisible, control or direction character. They are written as escapes (`\u{200B}`, `\tags{text}`, `\vs{text}`) and built in memory by the tests, and a test fails if a raw one appears.

`unicode-samples.json` holds the character samples. `malicious` samples mark each expected finding with double brackets; `harmless` samples, including multilingual text, must give no finding at Medium or above.

`markdown-samples.json` holds Markdown samples for hidden content, web addresses and look-alike hosts. `badges.example.test` and `collector.example.test` stand in for a badge service and a request collector, so no sample names a real one.
