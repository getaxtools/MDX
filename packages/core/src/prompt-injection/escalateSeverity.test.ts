import { describe, expect, it } from 'vitest';
import { escalateSeverity, PLAIN_FINDING_CONTEXT, type SeverityEscalation } from './escalateSeverity';

const INSTRUCTION_ESCALATION: SeverityEscalation = { hidden: 1, codeExample: -1 };
const SAFETY_ESCALATION: SeverityEscalation = { hidden: 1, codeExample: -1, negated: -2 };
const RUN_COMMAND_ESCALATION: SeverityEscalation = { hidden: 1, agentFile: -2, codeExample: -1 };
const CHARACTER_ESCALATION: SeverityEscalation = { agentFile: 1 };

describe('escalateSeverity', () => {
  it('keeps the base severity when no context applies', () => {
    expect(escalateSeverity('medium', INSTRUCTION_ESCALATION, PLAIN_FINDING_CONTEXT)).toBe('medium');
  });

  it('raises a hidden instruction by one step', () => {
    const hidden = { ...PLAIN_FINDING_CONTEXT, isHidden: true };

    expect(escalateSeverity('medium', INSTRUCTION_ESCALATION, hidden)).toBe('high');
  });

  it('caps the severity at High', () => {
    const hidden = { ...PLAIN_FINDING_CONTEXT, isHidden: true };

    expect(escalateSeverity('high', INSTRUCTION_ESCALATION, hidden)).toBe('high');
  });

  it('lowers an instruction inside a code example by one step', () => {
    const inCode = { ...PLAIN_FINDING_CONTEXT, isInCodeExample: true };

    expect(escalateSeverity('medium', INSTRUCTION_ESCALATION, inCode)).toBe('low');
  });

  it('does not lower code examples in agent files, where code is still read as instructions', () => {
    const inAgentFileCode = { ...PLAIN_FINDING_CONTEXT, isInCodeExample: true, isAgentFile: true };

    expect(escalateSeverity('medium', INSTRUCTION_ESCALATION, inAgentFileCode)).toBe('medium');
  });

  it('lowers a negated safety phrase by two steps', () => {
    const negated = { ...PLAIN_FINDING_CONTEXT, isNegated: true };

    expect(escalateSeverity('high', SAFETY_ESCALATION, negated)).toBe('low');
  });

  it('makes command requests Info in agent files, visible or hidden', () => {
    const visible = { ...PLAIN_FINDING_CONTEXT, isAgentFile: true };
    const hidden = { ...visible, isHidden: true };

    expect(escalateSeverity('low', RUN_COMMAND_ESCALATION, visible)).toBe('info');
    expect(escalateSeverity('low', RUN_COMMAND_ESCALATION, hidden)).toBe('info');
  });

  it('raises hidden characters in agent files by one step', () => {
    const agentFile = { ...PLAIN_FINDING_CONTEXT, isAgentFile: true };

    expect(escalateSeverity('medium', CHARACTER_ESCALATION, agentFile)).toBe('high');
  });

  it('adds the steps of all contexts before capping, so hidden code examples keep their severity', () => {
    const hiddenInCode = { ...PLAIN_FINDING_CONTEXT, isHidden: true, isInCodeExample: true };

    expect(escalateSeverity('high', INSTRUCTION_ESCALATION, hiddenInCode)).toBe('high');
  });

  it('never goes below Info', () => {
    const negated = { ...PLAIN_FINDING_CONTEXT, isNegated: true, isInCodeExample: true };

    expect(escalateSeverity('low', SAFETY_ESCALATION, negated)).toBe('info');
  });
});
