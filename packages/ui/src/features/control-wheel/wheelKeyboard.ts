export type WheelKeyAction =
  | { readonly action: 'focus'; readonly index: number }
  | { readonly action: 'chooseAndClose'; readonly index: number }
  | { readonly action: 'chooseAndStay'; readonly index: number }
  | { readonly action: 'switchFocusArea' }
  | { readonly action: 'close' }
  | { readonly action: 'none' };

export interface WheelKeyContext {
  readonly segmentCount: number;
  readonly focusedIndex: number;
  /** -1 in a right-to-left layout, where the ring runs counter-clockwise. */
  readonly direction: 1 | -1;
}

export type WheelKeyEvent = Pick<KeyboardEvent, 'key' | 'isComposing' | 'ctrlKey' | 'altKey' | 'metaKey'>;

const NONE: WheelKeyAction = { action: 'none' };
const SEGMENT_NUMBER = /^[1-9]$/;

type FocusMove = (context: WheelKeyContext) => number;

const FOCUS_MOVES: Readonly<Record<string, FocusMove>> = {
  ArrowDown: ({ focusedIndex }) => focusedIndex + 1,
  ArrowUp: ({ focusedIndex }) => focusedIndex - 1,
  ArrowRight: ({ focusedIndex, direction }) => focusedIndex + direction,
  ArrowLeft: ({ focusedIndex, direction }) => focusedIndex - direction,
  Home: () => 0,
  End: ({ segmentCount }) => segmentCount - 1,
};

const KEY_ACTIONS: Readonly<Record<string, (context: WheelKeyContext) => WheelKeyAction>> = {
  Enter: ({ focusedIndex }) => ({ action: 'chooseAndClose', index: focusedIndex }),
  ' ': ({ focusedIndex }) => ({ action: 'chooseAndStay', index: focusedIndex }),
  Tab: () => ({ action: 'switchFocusArea' }),
  Escape: () => ({ action: 'close' }),
};

/** What a key does while the focus is on a segment of the open control wheel. */
export function wheelKeyAction(event: WheelKeyEvent, context: WheelKeyContext): WheelKeyAction {
  if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return NONE;
  const move = Object.hasOwn(FOCUS_MOVES, event.key) ? FOCUS_MOVES[event.key] : undefined;
  if (move) return { action: 'focus', index: wrapped(move(context), context.segmentCount) };
  if (SEGMENT_NUMBER.test(event.key)) return numberAction(Number(event.key), context);
  const keyAction = Object.hasOwn(KEY_ACTIONS, event.key) ? KEY_ACTIONS[event.key] : undefined;
  return keyAction ? keyAction(context) : NONE;
}

function numberAction(segmentNumber: number, { segmentCount }: WheelKeyContext): WheelKeyAction {
  return segmentNumber <= segmentCount ? { action: 'chooseAndClose', index: segmentNumber - 1 } : NONE;
}

function wrapped(index: number, count: number): number {
  return ((index % count) + count) % count;
}
