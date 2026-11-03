const NODE_MAJOR_WITH_SOCKET_CRASH = 24;
const FIRST_FIXED_MINOR = 16;

// nodejs/node#63620: before 24.16, libuv fails a /GS check on Windows TCP connects (exit 0xC0000409).
export function hasKnownSocketCrash(platform: NodeJS.Platform, nodeVersion: string): boolean {
  if (platform !== 'win32') return false;
  const [major, minor = 0] = nodeVersion.split('.').map(Number);
  return major === NODE_MAJOR_WITH_SOCKET_CRASH && minor < FIRST_FIXED_MINOR;
}

export function setup(): void {
  if (!hasKnownSocketCrash(process.platform, process.versions.node)) return;
  throw new Error(
    `Node ${process.versions.node} crashes at random on Windows while opening local connections. ` +
      'Install the Node version named in .node-version.',
  );
}
