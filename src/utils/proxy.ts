/**
 * Proxy detection and configuration for network requests.
 *
 * Detects HTTP_PROXY / HTTPS_PROXY / ALL_PROXY environment variables
 * and configures undici's global dispatcher so that all fetch() calls
 * (including those made internally by giget) go through the proxy.
 */

import { ProxyAgent, setGlobalDispatcher } from "undici";

/**
 * Mask credentials in a proxy URL for safe logging.
 *
 * Replaces username and password with "***" so that credentials
 * are never printed to the console or written to log files.
 */
export function maskProxyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = "***";
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return "***";
  }
}

/**
 * Set up a global proxy dispatcher if proxy environment variables are present.
 *
 * Uses undici's ProxyAgent and setGlobalDispatcher so that all fetch() calls
 * go through the proxy. The try/catch handles malformed proxy URLs (e.g.
 * socks5://, missing protocol) that would cause `new ProxyAgent()` to throw.
 *
 * @returns The proxy URL string if a proxy was configured, or null otherwise.
 */
export function setupProxy(): string | null {
  const candidates = [
    process.env.HTTPS_PROXY,
    process.env.https_proxy,
    process.env.HTTP_PROXY,
    process.env.http_proxy,
    process.env.ALL_PROXY,
    process.env.all_proxy,
  ];
  const proxyUrl = candidates.find((v) => v != null && v !== "");

  if (!proxyUrl) {
    return null;
  }

  try {
    const agent = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(agent);
    return proxyUrl;
  } catch {
    console.warn(
      "Warning: Could not configure proxy. The proxy URL may be malformed.",
    );
    return null;
  }
}
