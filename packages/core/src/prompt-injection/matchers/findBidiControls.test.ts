import { describe, expect, it } from 'vitest';
import type { DocumentSegment } from '../DocumentStructure';
import { runInjectionCheck } from '../runInjectionCheck';

const RLO = '\u202E';
const LRE = '\u202A';
const PDF = '\u202C';
const RLI = '\u2067';
const PDI = '\u2069';
const RLM = '\u200F';
const LRM = '\u200E';
const ALM = '\u061C';

function findingsOf(text: string, segments: readonly DocumentSegment[] = []) {
  return runInjectionCheck({ text, origin: 'local', trigger: 'manual' }, { segments }).findings;
}

function asCode(text: string): DocumentSegment[] {
  return [{ kind: 'codeBlock', range: { from: 0, to: text.length }, language: 'js' }];
}

function rulesOf(findings: ReturnType<typeof findingsOf>, ruleId: string) {
  return findings.filter((finding) => finding.ruleId === ruleId);
}

describe('char-bidi-override', () => {
  it('reports an override in prose as Medium', () => {
    const [finding] = rulesOf(findingsOf(`Price: ${RLO}001${PDF}`), 'char-bidi-override');

    expect(finding?.severity).toBe('medium');
  });

  it('reports an override in code as High', () => {
    const code = `if (isAdmin) { ${RLO} } ${PDF}`;

    const [finding] = rulesOf(findingsOf(code, asCode(code)), 'char-bidi-override');

    expect(finding?.severity).toBe('high');
  });

  it('reports an override in link text as High', () => {
    const text = `[safe${RLO}exe.txt](https://example.invalid)`;
    const segments: DocumentSegment[] = [
      { kind: 'link', range: { from: 0, to: text.length }, destination: '', textRange: { from: 1, to: 10 } },
    ];

    const [finding] = rulesOf(findingsOf(text, segments), 'char-bidi-override');

    expect(finding?.severity).toBe('high');
  });
});

describe('char-bidi-unbalanced', () => {
  it('reports a Trojan Source line with an unclosed override in a code block as High', () => {
    const code = `const access = "user ${RLO} // admin";\nreturn;`;

    const findings = rulesOf(findingsOf(code, asCode(code)), 'char-bidi-unbalanced');

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'high', line: 0 });
  });

  it('reports a direction control left open at the end of a line in prose', () => {
    const findings = rulesOf(findingsOf(`one ${RLI}two\nthree ${PDI}`), 'char-bidi-unbalanced');

    expect(findings.map((finding) => finding.line)).toEqual([0, 1]);
  });

  it('does not report balanced isolates and embeddings in prose', () => {
    const text = `Name: ${RLI}محمد${PDI}, ${LRE}code${PDF}.`;

    expect(rulesOf(findingsOf(text), 'char-bidi-unbalanced')).toEqual([]);
  });

  it('reports closers in the wrong nesting order', () => {
    expect(rulesOf(findingsOf(`${RLI}${LRE}x${PDI}${PDF}`), 'char-bidi-unbalanced')).toHaveLength(1);
  });

  it('reports even balanced controls inside code', () => {
    const code = `let name = "${RLI}x${PDI}";`;

    expect(rulesOf(findingsOf(code, asCode(code)), 'char-bidi-unbalanced')).toHaveLength(1);
  });
});

describe('char-bidi-mark-in-code', () => {
  it('does not report direction marks in Arabic prose', () => {
    const arabic = `مرحبا${RLM} بكم${ALM} في MDX${LRM}.`;

    expect(findingsOf(arabic)).toEqual([]);
  });

  it('reports a direction mark inside code as Medium', () => {
    const code = `rm -rf ./build${RLM}`;

    const [finding] = rulesOf(findingsOf(code, asCode(code)), 'char-bidi-mark-in-code');

    expect(finding).toMatchObject({ severity: 'medium', from: code.length - 1, to: code.length });
  });

  it('reports a direction mark inside a link address', () => {
    const text = `[docs](https://example.invalid/${LRM}path)`;
    const destinationStart = text.indexOf('https');
    const segments: DocumentSegment[] = [
      {
        kind: 'link',
        range: { from: 0, to: text.length },
        destination: '',
        destinationRange: { from: destinationStart, to: text.length - 1 },
      },
    ];

    expect(rulesOf(findingsOf(text, segments), 'char-bidi-mark-in-code')).toHaveLength(1);
  });
});
