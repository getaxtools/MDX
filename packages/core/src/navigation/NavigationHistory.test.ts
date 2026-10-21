import { InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { MAX_NAVIGATION_ENTRIES, NavigationHistory } from './NavigationHistory';

const guide = InMemoryDocumentFiles.locationOf('C:\\Docs\\guide.md');
const setup = InMemoryDocumentFiles.locationOf('C:\\Docs\\setup.md');
const faq = InMemoryDocumentFiles.locationOf('C:\\Docs\\faq.md');
const canShowAll = () => true;

function visited(...locations: (typeof guide)[]): NavigationHistory {
  return locations.reduce((history, location) => history.visit(location), NavigationHistory.empty());
}

describe('NavigationHistory', () => {
  it('goes back and forward through visited documents', () => {
    const history = visited(guide, setup, faq);

    const back = history.back(canShowAll);
    const backAgain = back?.history.back(canShowAll);
    const forward = backAgain?.history.forward(canShowAll);

    expect(back?.location).toBe(setup);
    expect(backAgain?.location).toBe(guide);
    expect(forward?.location).toBe(setup);
  });

  it('has nowhere to go at either end', () => {
    const history = visited(guide);

    expect(history.back(canShowAll)).toBeUndefined();
    expect(history.forward(canShowAll)).toBeUndefined();
  });

  it('forgets the documents ahead after visiting a new one', () => {
    const wentBack = visited(guide, setup).back(canShowAll)?.history ?? NavigationHistory.empty();

    const history = wentBack.visit(faq);

    expect(history.forward(canShowAll)).toBeUndefined();
    expect(history.back(canShowAll)?.location).toBe(guide);
  });

  it('records visiting the same document twice in a row once', () => {
    const history = visited(guide, guide, setup);

    expect(history.back(canShowAll)?.history.back(canShowAll)).toBeUndefined();
  });

  it('skips documents that can no longer be shown', () => {
    const history = visited(guide, setup, faq);

    const back = history.back((location) => location !== setup);

    expect(back?.location).toBe(guide);
  });

  it('keeps only the most recent documents', () => {
    const locations = Array.from({ length: MAX_NAVIGATION_ENTRIES + 5 }, (_, index) =>
      InMemoryDocumentFiles.locationOf(`C:\\Docs\\${String(index)}.md`),
    );
    let history = visited(...locations);
    let steps = 0;

    for (let step = history.back(canShowAll); step; step = history.back(canShowAll)) {
      history = step.history;
      steps += 1;
    }

    expect(steps).toBe(MAX_NAVIGATION_ENTRIES - 1);
  });
});
