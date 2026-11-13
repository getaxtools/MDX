import type { ViewerCommand } from '../viewer/viewerCommands';

/** A command whose keys the user can change, saved under a stable id. */
export interface RebindableCommand {
  readonly id: string;
  readonly command: ViewerCommand;
}

export const REBINDABLE_COMMANDS: readonly RebindableCommand[] = [
  { id: 'toggleControlWheel', command: { kind: 'toggleControlWheel' } },
];

export function isRebindableCommandId(id: string): boolean {
  return REBINDABLE_COMMANDS.some((rebindable) => rebindable.id === id);
}

export function rebindableIdOf(command: ViewerCommand): string | undefined {
  const commandKey = JSON.stringify(command);
  return REBINDABLE_COMMANDS.find((rebindable) => JSON.stringify(rebindable.command) === commandKey)?.id;
}
