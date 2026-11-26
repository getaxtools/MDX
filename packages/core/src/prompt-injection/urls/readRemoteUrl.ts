export interface RemoteUrl {
  readonly url: URL;
  /** The host as the URL parser encodes it: lower case, look-alike letters in Punycode. */
  readonly host: string;
  /** The host as written in the document, before any encoding. */
  readonly writtenHost: string;
}

const REMOTE_ADDRESS = /^(?:https?:)?\/\//i;
const WRITTEN_HOST = /^(?:https?:)?\/\/(?:[^@/?#\s]*@)?(\[[^\]]*\]|[^/?#:\s]+)/i;
const PROTOCOL_RELATIVE_BASE = 'https:';

/** Reads a web address that a client would fetch from the network; undefined for relative, data and other addresses. */
export function readRemoteUrl(written: string): RemoteUrl | undefined {
  const trimmed = written.trim();
  if (!REMOTE_ADDRESS.test(trimmed)) return undefined;
  const absolute = trimmed.startsWith('//') ? `${PROTOCOL_RELATIVE_BASE}${trimmed}` : trimmed;
  if (!URL.canParse(absolute)) return undefined;
  const url = new URL(absolute);
  return {
    url,
    host: url.hostname.replace(/\.$/, ''),
    writtenHost: WRITTEN_HOST.exec(trimmed)?.[1] ?? url.hostname,
  };
}

/** True when the host is one of the patterns or below it; `*.example` and `example` both cover subdomains. */
export function isHostIn(host: string, patterns: readonly string[]): boolean {
  const lowerHost = host.toLowerCase();
  return patterns.some((pattern) => {
    const base = pattern.toLowerCase().replace(/^\*\./, '');
    return lowerHost === base || lowerHost.endsWith(`.${base}`);
  });
}

export function withoutWww(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}
