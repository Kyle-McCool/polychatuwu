// Single source of truth for where the relay server lives. The chat websocket is ws(s);
// the HLS proxy and any other HTTP routes share the same host over http(s).
export const WS_URL = import.meta.env.VITE_WS_URL || `ws://${location.hostname}:8787`;
export const HTTP_URL = WS_URL.replace(/^ws/, "http");
