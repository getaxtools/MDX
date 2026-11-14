import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { sectionChange, sectionsOf, type SectionAction } from './outlineSections';

function stateOf(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
}

function changed(doc: string, headingLine: number, action: SectionAction): string {
  const state = stateOf(doc);
  const change = sectionChange(state, headingLine, action);
  if (change.outcome !== 'changed') throw new Error(`refused: ${change.refusal}`);
  return state.update(change.spec).state.doc.toString();
}

const GUIDE = '# Guide\n\n## Install\n\nRun it.\n\n### Windows\n\nClick.\n\n## Use\n\nOpen a file.\n';

describe('outline sections', () => {
  it('section includes subsections', () => {
    const state = stateOf(GUIDE);
    const install = sectionsOf(state).find((section) =>
      state.sliceDoc(section.from).startsWith('## Install'),
    );

    expect(install && state.sliceDoc(install.from, install.to)).toBe(
      '## Install\n\nRun it.\n\n### Windows\n\nClick.\n\n',
    );
  });

  it('moves a section down past its sibling, subsections included', () => {
    expect(changed(GUIDE, 2, 'moveDown')).toBe(
      '# Guide\n\n## Use\n\nOpen a file.\n\n## Install\n\nRun it.\n\n### Windows\n\nClick.\n',
    );
  });

  it('moving up then down restores the text', () => {
    const up = changed(GUIDE, 10, 'moveUp');

    expect(changed(up, 2, 'moveDown')).toBe(GUIDE);
  });

  it('a section without a sibling cannot move', () => {
    expect(sectionChange(stateOf(GUIDE), 6, 'moveUp')).toEqual({ outcome: 'refused', refusal: 'atEdge' });
  });

  it('promote raises the heading and its subsections one level', () => {
    expect(changed(GUIDE, 2, 'promote')).toBe(
      '# Guide\n\n# Install\n\nRun it.\n\n## Windows\n\nClick.\n\n## Use\n\nOpen a file.\n',
    );
  });

  it('promote stops at level 1', () => {
    expect(sectionChange(stateOf(GUIDE), 0, 'promote')).toEqual({
      outcome: 'refused',
      refusal: 'atTopLevel',
    });
  });

  it('demote stops at level 6', () => {
    expect(sectionChange(stateOf('###### Deep\n'), 0, 'demote')).toEqual({
      outcome: 'refused',
      refusal: 'atLowestLevel',
    });
  });

  it('an underlined heading refuses with a reason', () => {
    expect(sectionChange(stateOf('Title\n=====\n\nText\n'), 0, 'demote')).toEqual({
      outcome: 'refused',
      refusal: 'underlinedHeading',
    });
  });

  it('only heading markers change', () => {
    const doc = '## Keep # this text\n\nBody ## too\n';

    expect(changed(doc, 0, 'demote')).toBe('### Keep # this text\n\nBody ## too\n');
  });

  it('a line that is not a heading is refused', () => {
    expect(sectionChange(stateOf(GUIDE), 4, 'moveUp')).toEqual({
      outcome: 'refused',
      refusal: 'notAHeading',
    });
  });
});
