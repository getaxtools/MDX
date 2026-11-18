import { createServer, type AddressInfo } from 'node:net';

const LOCALHOST = '127.0.0.1';
const CONNECT_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 200;

interface DevToolsTarget {
  readonly type: string;
  readonly webSocketDebuggerUrl?: string;
}

interface DevToolsReply {
  readonly id?: number;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: { readonly message: string };
}

type EventListener = (params: unknown) => void;

/**
 * The browser arguments that open WebView2's DevTools protocol on a port, for specs that measure or
 * emulate what WebDriver cannot. Only the UI-test app is ever started with them.
 */
export function devToolsBrowserArguments(port: number): string {
  return `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port=${String(port)}`;
}

export async function freeDevToolsPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, LOCALHOST, resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** A DevTools protocol session with the app's page. */
export class DevTools {
  private nextId = 1;
  private readonly pending = new Map<number, (reply: DevToolsReply) => void>();
  private readonly listeners = new Map<string, Set<EventListener>>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => this.receive(String(event.data)));
  }

  static async connect(port: number): Promise<DevTools> {
    const address = await pageAddress(port);
    const socket = new WebSocket(address);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new Error(`DevTools did not answer at ${address}`)), {
        once: true,
      });
    });
    return new DevTools(socket);
  }

  send<Result>(method: string, params: Record<string, unknown> = {}): Promise<Result> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise<Result>((resolve, reject) => {
      this.pending.set(id, (reply) => {
        if (reply.error) reject(new Error(`${method}: ${reply.error.message}`));
        else resolve(reply.result as Result);
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method: string, listener: EventListener): () => void {
    const listeners = this.listeners.get(method) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  close(): void {
    this.socket.close();
  }

  private receive(text: string): void {
    const reply = JSON.parse(text) as DevToolsReply;
    if (reply.id !== undefined) {
      this.pending.get(reply.id)?.(reply);
      this.pending.delete(reply.id);
      return;
    }
    if (reply.method) for (const listener of this.listeners.get(reply.method) ?? []) listener(reply.params);
  }
}

async function pageAddress(port: number): Promise<string> {
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://${LOCALHOST}:${String(port)}/json/list`);
      const targets = (await response.json()) as DevToolsTarget[];
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`DevTools did not start on port ${String(port)}`);
}
