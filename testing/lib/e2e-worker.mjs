// THE E2E'S OWN ENTRY, never shipped: the built Worker (apps/web/worker.ts,
// which answers /api/listen and hands the rest to .open-next/worker.js), with
// its two speech services answered by deterministic in-process stand-ins.
//
// Workers AI has no local mode and cannot be called offline, and Deepgram
// needs a key and the network. So this entry, which testing/e2e.test.sh copies
// next to the staged build's worker.ts (with the `ai` block removed from its
// copy of wrangler.jsonc), gives the Worker:
//
// - `env.AI`, whose run(model, params, { websocket: true }) answers as Workers
//   AI's real-time models do: a 101 Response carrying a WebSocket. Its far end
//   reads the linear16 PCM the page streams (at the `sample_rate` the socket
//   was opened with), finds the bursts of sound in it by their energy, and for
//   each burst sends Deepgram's own `Results` messages — interim ones while the
//   burst lasts, then one `is_final` + `speech_final` when it ends — with the
//   words of SCRIPT, one script line per burst. So what reaches the page is
//   built from the audio that really arrived, in the shape Nova-3 sends;
// - a global fetch that answers api.deepgram.com's token grant itself
//   (POST /v1/auth/grant, `Authorization: Token <key>`), wrapped BEFORE the
//   Worker's modules load (a dynamic import, after the wrap: Next.js captures
//   the fetch it patches when its server starts), so the owner's Deepgram key
//   path is served too, and nothing leaves the machine.
//
// GET /__e2e/calls lists what the stand-ins were asked. What this proves is
// the app's half — the socket, the audio format, the transcript events, the
// token route — not that a real model hears speech: only a deployment does.
const calls = [];

const SCRIPT = [
  "Hello from the live transcription test.",
  "The second burst of sound becomes the second line.",
  "And the third one ends the recording.",
];

// A burst is at least this loud (RMS of 16-bit samples) for at least this
// long, and ends after this much quiet.
const LOUD = 1500;
const MIN_SPEECH_S = 0.3;
const END_SILENCE_S = 0.4;
const WORD_EVERY_S = 0.25;

function results({ transcript, start, duration, isFinal, speechFinal }) {
  return JSON.stringify({
    type: "Results",
    channel_index: [0, 1],
    duration,
    start,
    is_final: isFinal,
    speech_final: speechFinal,
    channel: { alternatives: [{ transcript, confidence: 0.99, words: [] }] },
    metadata: { request_id: "e2e", model_info: { name: "nova-3", version: "e2e", arch: "nova-3" }, model_uuid: "e2e" },
    from_finalize: false,
  });
}

function transcriber(server, rate, record) {
  let t = 0; // seconds of audio received
  let speechStart = -1;
  let quiet = 0;
  let segment = 0;
  let wordsSent = 0;
  return (bytes) => {
    if (bytes.byteLength % 2 !== 0) record.oddChunks++;
    const samples = new Int16Array(bytes.slice(0, bytes.byteLength - (bytes.byteLength % 2)));
    record.bytes += samples.length * 2;
    record.chunks++;
    let sum = 0;
    for (const s of samples) sum += s * s;
    const rms = samples.length ? Math.sqrt(sum / samples.length) : 0;
    const seconds = samples.length / rate;
    const loud = rms >= LOUD;
    if (loud) {
      if (speechStart < 0) {
        speechStart = t;
        wordsSent = 0;
      }
      quiet = 0;
      const words = (SCRIPT[segment % SCRIPT.length] ?? "").split(" ");
      const due = Math.min(words.length, Math.floor((t + seconds - speechStart) / WORD_EVERY_S));
      if (due > wordsSent) {
        wordsSent = due;
        record.interim++;
        server.send(results({ transcript: words.slice(0, due).join(" "), start: speechStart, duration: t + seconds - speechStart, isFinal: false, speechFinal: false }));
      }
    } else if (speechStart >= 0) {
      quiet += seconds;
      if (quiet >= END_SILENCE_S) {
        const duration = t - quiet - speechStart + seconds;
        if (duration >= MIN_SPEECH_S) {
          const line = SCRIPT[segment % SCRIPT.length] ?? "";
          record.finals.push(line);
          server.send(results({ transcript: line, start: speechStart, duration, isFinal: true, speechFinal: true }));
          segment++;
        }
        speechStart = -1;
        quiet = 0;
      }
    }
    t += seconds;
    record.seconds = Number(t.toFixed(3));
  };
}

const fakeAI = {
  async run(model, inputs, options) {
    const record = {
      kind: "workers-ai.run",
      model,
      inputs,
      websocket: Boolean(options?.websocket),
      bytes: 0,
      chunks: 0,
      oddChunks: 0,
      seconds: 0,
      interim: 0,
      finals: [],
      text: [],
      closed: false,
      errors: [],
    };
    calls.push(record);
    if (!options?.websocket) {
      return Response.json({ errors: [{ message: "e2e stand-in: only the real-time (websocket) mode is answered" }] }, { status: 400 });
    }
    const rate = Number(inputs?.sample_rate);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const feed = transcriber(server, rate, record);
    // Binary frames reach a Worker as ArrayBuffers, or as Blobs through
    // wrangler dev's proxy: read either, one after the other, in order.
    let queue = Promise.resolve();
    server.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        record.text.push(event.data.slice(0, 200));
        return;
      }
      const data = event.data;
      queue = queue
        .then(async () => feed(data instanceof ArrayBuffer ? data : await data.arrayBuffer()))
        .catch((error) => record.errors.push(String(error)));
    });
    server.addEventListener("close", () => {
      record.closed = true;
      try {
        server.close(1000, "done");
      } catch {}
    });
    return new Response(null, { status: 101, webSocket: client });
  },
};

// Deepgram's token grant, as @deepgram/sdk 4 calls it.
async function deepgram(request) {
  const url = new URL(request.url);
  const auth = request.headers.get("authorization") ?? "";
  let body = null;
  try {
    body = await request.json();
  } catch {}
  calls.push({ kind: "deepgram", method: request.method, path: url.pathname, auth, body });
  if (request.method === "POST" && url.pathname === "/v1/auth/grant") {
    const key = auth.replace(/^Token\s+/i, "");
    if (!auth.startsWith("Token ") || !key || key.startsWith("invalid")) {
      return Response.json({ err_code: "FORBIDDEN", err_msg: "Insufficient permissions.", request_id: "e2e" }, { status: 403 });
    }
    return Response.json({ access_token: `e2e-access-token-for-${key.slice(-4)}`, expires_in: 30 });
  }
  return Response.json({ err_code: "NOT_FOUND", err_msg: `no stand-in for ${url.pathname}` }, { status: 404 });
}

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const request = new Request(input, init);
  if (new URL(request.url).hostname === "api.deepgram.com") return deepgram(request);
  return realFetch(input, init);
};

const { default: worker } = await import("./worker.ts");
export default {
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname === "/__e2e/calls") return Response.json(calls);
    return worker.fetch(request, { ...env, AI: fakeAI }, ctx);
  },
};
