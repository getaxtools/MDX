/** Whether a canonical key lies somewhere below a folder's canonical key, at any depth. */
export function isInsideFolder(canonicalKey: string, folderKey: string): boolean {
  const separator = canonicalKey.charAt(folderKey.length);
  return canonicalKey.startsWith(folderKey) && (separator === '\\' || separator === '/');
}
