import type { TexCommand } from '@mdx/editor';
import { TEX_COMMAND_NAMES_BY_ARGUMENT_COUNT } from './texCommands';

/** Every command the equation editor suggests, in alphabetical order. */
export const SUPPORTED_TEX_COMMANDS: readonly TexCommand[] = TEX_COMMAND_NAMES_BY_ARGUMENT_COUNT.flatMap(
  (names, argumentCount) => names.split(' ').map((name) => ({ name, argumentCount })),
).sort((first, second) => first.name.localeCompare(second.name, 'en'));
