import type { EventCallback } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

/** Hears an event sent to this window or to every window, never one sent to another window. */
export function listenInThisWindow<Payload>(event: string, handler: EventCallback<Payload>): () => void {
  const stopListening = getCurrentWebviewWindow().listen<Payload>(event, handler);
  return () => void stopListening.then((unlisten) => unlisten());
}

export function thisWindowLabel(): string {
  return getCurrentWebviewWindow().label;
}
