import { describe, expect, it } from 'vitest';
import { restoreAppState, toPersistedAppState } from '../session/persistedAppState';
import { parseJumpListRemovals, withJumpListRemovals } from './jumpListRemovals';

describe('Jump List removals', () => {
  it('keeps the newest time of each removed workspace and drops values that are not times', () => {
    const removals = withJumpListRemovals({ reading: 10 }, ['reading', 'plans'], 20);

    expect(removals).toEqual({ reading: 20, plans: 20 });
    expect(parseJumpListRemovals({ reading: 5, plans: 'soon', later: Number.NaN })).toEqual({ reading: 5 });
    expect(parseJumpListRemovals(['reading'])).toEqual({});
  });

  it('keeps at most fifty, the oldest going first', () => {
    const many = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`w-${String(index)}`, index]));

    const kept = parseJumpListRemovals(many);

    expect(Object.keys(kept)).toHaveLength(50);
    expect(kept['w-59']).toBe(59);
    expect(kept['w-0']).toBeUndefined();
  });

  it('survives saving and restoring the app state', () => {
    const state = { ...restoreAppState(undefined), jumpListRemovals: { reading: 30 } };

    const restored = restoreAppState(JSON.parse(JSON.stringify(toPersistedAppState(state))));

    expect(restored.jumpListRemovals).toEqual({ reading: 30 });
  });
});
