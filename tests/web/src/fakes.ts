// What the tests stand in for: the Worker's context (getCloudflareContext),
// a Workers AI binding that opens real-time sockets, and Deepgram's token
// grant behind the global fetch.
import { vi } from "vitest";

const CONTEXT = Symbol.for("__cloudflare-context__");

// What getCloudflareContext() returns inside the Worker, for the duration of
// a test (clearCloudflareContext in afterEach).
export function setCloudflareContext(env: Record<string, unknown>) {
  (globalThis as Record<symbol, unknown>)[CONTEXT] = { env, ctx: {}, cf: {} };
}

export function clearCloudflareContext() {
  delete (globalThis as Record<symbol, unknown>)[CONTEXT];
}

// A Workers AI binding whose run(model, params, { websocket: true }) answers
// with a Response carrying a socket, as the real-time models do. Node has no
// WebSocketPair, so the "socket" is a marker object the test can recognise.
export function fakeAI(opts: { socket?: boolean } = {}) {
  const calls: { model: string; params: Record<string, unknown>; options?: Record<string, unknown> }[] = [];
  const socket = { kind: "fake-nova-3-socket" };
  const binding = {
    async run(model: string, params: Record<string, unknown>, options?: Record<string, unknown>) {
      calls.push({ model, params, options });
      const response = new Response(null, { status: 200 }) as Response & { webSocket?: unknown };
      if (opts.socket !== false && options?.websocket) Object.defineProperty(response, "webSocket", { value: socket });
      return response;
    },
  };
  return { binding, calls, socket };
}

// Deepgram's POST /v1/auth/grant behind the global fetch: a key starting with
// "invalid" is refused as Deepgram refuses a key of too low a scope.
export function stubDeepgram() {
  const grants: { url: string; auth: string | null }[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const auth = request.headers.get("authorization");
    grants.push({ url: request.url, auth });
    if (auth?.startsWith("Token invalid")) {
      return Response.json({ err_code: "FORBIDDEN", err_msg: "Insufficient permissions.", request_id: "t" }, { status: 403 });
    }
    return Response.json({ access_token: "short-lived-token", expires_in: 30 });
  });
  return grants;
}

// A request for the live-transcription socket, as a browser sends it.
export function upgrade(url: string, headers: Record<string, string> = {}, method = "GET") {
  return new Request(url, {
    method,
    headers: {
      connection: "Upgrade",
      upgrade: "websocket",
      "sec-websocket-version": "13",
      "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
      ...headers,
    },
  });
}
