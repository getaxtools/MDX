export interface FileArcGestureHandlers {
  /** The wheel turned with Ctrl held. */
  onWheel: (event: WheelEvent) => void;
  onChoose: () => void;
  onCancel: () => void;
}

/**
 * Listens to the window while the arc is open and stops when the returned function is called.
 * Letting go of Ctrl, Enter, or a pointer or wheel event without Ctrl (a key release the window
 * missed) chooses; Esc or leaving the window cancels.
 */
export function listenToFileArcGesture(target: EventTarget, handlers: FileArcGestureHandlers): () => void {
  const listeners: [string, (event: Event) => void, AddEventListenerOptions][] = [
    ['keyup', (event) => handleKeyup(event as KeyboardEvent, handlers), {}],
    ['keydown', (event) => handleKeydown(event as KeyboardEvent, handlers), { capture: true }],
    ['pointermove', (event) => handlePointer(event as PointerEvent, handlers), { passive: true }],
    ['wheel', (event) => handleWheel(event as WheelEvent, handlers), { capture: true, passive: false }],
    ['blur', () => handlers.onCancel(), {}],
  ];
  for (const [type, listener, options] of listeners) target.addEventListener(type, listener, options);
  return () => {
    for (const [type, listener, options] of listeners) target.removeEventListener(type, listener, options);
  };
}

function handleKeyup(event: KeyboardEvent, handlers: FileArcGestureHandlers) {
  if (event.key === 'Control' && !event.isComposing) handlers.onChoose();
}

const HANDLERS_BY_KEY: Readonly<Record<string, 'onCancel' | 'onChoose'>> = {
  Escape: 'onCancel',
  Enter: 'onChoose',
};

function handleKeydown(event: KeyboardEvent, handlers: FileArcGestureHandlers) {
  const handlerName = Object.hasOwn(HANDLERS_BY_KEY, event.key) ? HANDLERS_BY_KEY[event.key] : undefined;
  if (event.isComposing || !handlerName) return;
  event.preventDefault();
  event.stopPropagation();
  handlers[handlerName]();
}

// The browser also reports a still pointer when the page changes under it, as when the arc appears.
function handlePointer(event: PointerEvent, handlers: FileArcGestureHandlers) {
  const hasMoved = event.movementX !== 0 || event.movementY !== 0;
  if (hasMoved && !event.ctrlKey) handlers.onChoose();
}

// The arc owns the wheel while it is open, so the document neither scrolls nor zooms underneath.
function handleWheel(event: WheelEvent, handlers: FileArcGestureHandlers) {
  event.preventDefault();
  event.stopPropagation();
  if (event.ctrlKey) handlers.onWheel(event);
  else handlers.onChoose();
}
