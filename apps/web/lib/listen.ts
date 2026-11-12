// The live-transcription socket on Workers AI: GET /api/listen with
// `Upgrade: websocket` opens Deepgram's Nova-3 through the Worker's AI binding
// (`env.AI.run(model, params, { websocket: true })`) and hands that socket to
// the browser — the Response Workers AI answers IS the 101 the browser gets,
// so audio and transcripts travel between the page and the model with the
// Worker out of the path. No key: the binding is the credential.
//
// The page streams linear16 PCM at its AudioContext's own rate (the
// AudioWorklet in public/pcm-capture.worklet.js) and reads Deepgram's own
// `Results` messages back, the shape upstream's caption code reads.
// worker.ts calls handleListen before any request reaches Next.js: a route
// handler cannot answer with a WebSocket.

export const NOVA_3 = "@cf/deepgram/nova-3";
export const LISTEN_PATH = "/api/listen";

// The sample rates a browser's AudioContext runs at (8 to 48 kHz; most run
// at 44.1 or 48 kHz). Anything else is refused before the model is asked.
export const MIN_SAMPLE_RATE = 8000;
export const MAX_SAMPLE_RATE = 48000;

// Upstream's live options (app/components/App.tsx: nova-3, interim results,
// smart formatting, filler words, a 3 s utterance end), as the Workers AI
// model takes them — strings, as Workers AI's own Nova-3 client sends them —
// plus the audio the page sends.
export function listenParams(url: URL): Record<string, string> | null {
  const raw = url.searchParams.get("sample_rate") ?? "";
  if (!/^\d{4,5}$/.test(raw)) return null;
  const rate = Number(raw);
  if (rate < MIN_SAMPLE_RATE || rate > MAX_SAMPLE_RATE) return null;
  return {
    encoding: "linear16",
    sample_rate: String(rate),
    interim_results: "true",
    smart_format: "true",
    filler_words: "true",
    utterance_end_ms: "3000",
  };
}

type ListenEnv = { AI?: Pick<CloudflareEnv["AI"], "run"> };

const refuse = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export async function handleListen(request: Request, env: ListenEnv): Promise<Response> {
  if (request.method !== "GET") return refuse(405, "Use GET with Upgrade: websocket.");
  if ((request.headers.get("upgrade") ?? "").toLowerCase() !== "websocket") {
    return refuse(426, "This is the live-transcription socket: connect with a WebSocket.");
  }
  // A browser always names the page that opens a socket. Only this site's own
  // page may spend this account's Workers AI on it.
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin) {
    let host = "";
    try {
      host = new URL(origin).host;
    } catch {
      host = "";
    }
    if (host !== url.host) return refuse(403, "Open the socket from this site's own page.");
  }
  const params = listenParams(url);
  if (!params) {
    return refuse(400, `Pass sample_rate, the audio's rate in Hz (${MIN_SAMPLE_RATE}–${MAX_SAMPLE_RATE}).`);
  }
  if (!env.AI) return refuse(503, "Workers AI is not bound: run the app as a Worker (wrangler dev or a deployment).");
  const answer = (await env.AI.run(NOVA_3, params, { websocket: true })) as Response & { webSocket?: unknown };
  if (!answer || answer.webSocket == null) {
    return refuse(502, "Workers AI did not open a transcription socket.");
  }
  return answer;
}
