# live-transcription — design

## 1. The template

deepgram-starters/nextjs-live-transcription (`6c88264`, 2026-11-06; MIT) is a
Next.js 14 app-router page with no server rendering to speak of:

- `app/page.tsx` — the header (Deepgram's logo, a GitHub star button, "Get an
  API Key"), the footer's share links, and `App`;
- `app/components/App.tsx` — asks for the microphone on mount, connects once
  it is ready (`nova-3`, interim results, smart format, filler words, a 3 s
  utterance end), sends the MediaRecorder's 250 ms WebM chunks to the
  connection, shows each transcript as the caption and clears the final one
  3 s later; `Visualizer.tsx` draws the microphone's spectrum;
- `app/context/*` — the MediaRecorder, and Deepgram's `LiveClient` opened with
  a token from `/api/authenticate`;
- `app/api/authenticate/route.ts` — `createClient(DEEPGRAM_API_KEY)
  .auth.grantToken()`, answered uncached;
- `middleware.ts` — CORS headers on that route from env vars (edge).

It needs a Deepgram key: without one, the token route fails and nothing
transcribes.

## 2. How it maps to Cloudflare

| Upstream | Here |
|---|---|
| Next.js on Vercel | `@opennextjs/cloudflare` 1.20.16 → `.open-next/worker.js` + Static Assets; the page pre-rendered and served from the static-assets incremental cache, which the build copies into place itself (`populateCache` would open a Cloudflare session for the AI binding) |
| — | `worker.ts`, wrangler's `main`: `/api/listen` first, everything else to the OpenNext Worker |
| Next 14, React 18 | Next 15.5.29 (OpenNext's floor on the 15 line; 14 is refused), React 19 |
| `DEEPGRAM_API_KEY`, required | Optional: an Orun secret pushed to the Worker after the build, read per request |
| The edge middleware | Kept as is; OpenNext runs it |

## 3. Transcription on Workers AI

Workers AI hosts Deepgram's Nova-3 with a real-time mode: the binding opens it
as a WebSocket with `env.AI.run("@cf/deepgram/nova-3", params, { websocket:
true })`, which answers a Response whose `webSocket` is the model's socket.
Cloudflare's own client for it (the `agents` package's voice transcriber,
`Nova3Session`) sends `encoding: linear16`, `sample_rate`, `interim_results`
and Deepgram's other options as strings, streams raw PCM, and reads
`{ type: "Results", channel: { alternatives: [{ transcript }] }, is_final,
speech_final }` — Deepgram's own message, the one upstream's caption code
reads.

So:

- **The socket is the Worker's own.** `worker.ts` answers `GET /api/listen`
  before Next.js (a route handler cannot return a 101 through OpenNext), and
  `lib/listen.ts` returns the binding's Response as it is — the browser's
  101 — so audio and transcripts travel between the page and the model with
  the Worker out of the path (no CPU per message). Nova-3's options are
  upstream's, plus the audio's format and rate.
- **The audio is linear16.** The page cannot send Nova-3 here the
  MediaRecorder's WebM (container audio on this socket is undocumented), so
  an AudioWorklet (`public/pcm-capture.worklet.js`) taps the microphone's
  stream, converts channel 0 to 16-bit PCM and posts it in 100 ms chunks, at
  the AudioContext's own rate, which the page names in `?sample_rate=`.
- **The page barely changes.** `lib/workers-ai-live.ts` speaks to the page as
  Deepgram's `LiveClient` does (`open`, `close`, `Results`; `send`,
  `keepAlive`, `finish`), dropping the WebM chunks `App.tsx` still passes to
  `send`; the Deepgram context picks it, or Deepgram's own client, by what
  `/api/authenticate` answers (`workers-ai`, `deepgram` with a token, or
  `none` with a reason the page shows as its caption).
- **The key never leaves the Worker.** With `DEEPGRAM_API_KEY` stored, the
  token route mints the browser a short-lived token (`grantToken` uses the
  Worker's global fetch), and the page streams to Deepgram directly, as
  upstream. Upstream's `DEEPGRAM_ENV=development` branch, which answered the
  raw key, is not carried.

## 4. The socket's refusals

Before the model is opened: a request that is not a WebSocket upgrade (426),
a page on another origin (403 — a browser always names it), a sample rate
outside 8–48 kHz (400), anything but GET (405); and 503 without a binding,
502 if the binding answers without a socket. The page has no sign-in, so the
origin check is what keeps other websites from spending the account's
Workers AI through a visitor's browser (risk LT-H).

## 5. The repository and the build

pdf-quiz-generator's shape: `apps/web` (the app), `tests/web` (vitest),
`tooling/*`, no infra and no packages. `wrangler.jsonc` declares the AI
binding and `main: worker.ts`; the component's `workerEntrypoint` stays
`.open-next/worker.js`, which the verify step checks the build produced. The
smoke reads the template's caption and the socket's 426 — no model opened.
Two phases, one landing (`01-product`, then `02-docs`).

## 6. Testing without a model

- `tests/web` — the socket handler and the token route on the Worker's env
  (fake binding, Deepgram's grant behind a stubbed fetch); the browser client
  against stand-ins for the Web Audio and WebSocket APIs; the worklet in a VM;
  the template's `App` in jsdom (interim, final, cleared after 3 s; the chunks
  sent, never an empty one; the reason shown when nothing is connected).
- The e2e's own Worker entry (`testing/lib/e2e-worker.mjs`) gives the built
  Worker a fake binding whose `run(…, { websocket: true })` answers a real
  `WebSocketPair`: its far end reads the PCM, finds bursts of sound by their
  energy and sends Deepgram's `Results` for each, interim then final; and a
  global fetch answering Deepgram's grant. A stdlib WAV of three bursts
  (`testing/lib/speech-wav.py`) is streamed over the socket by
  `listen-client.mjs`; on Linux, headless Chrome plays it as its fake
  microphone into the page itself (`browser-caption.mjs`).

## 7. Out of scope

Recording or storing transcripts, speaker labels, languages other than
Nova-3's default, sign-in, rate limits.

## 8. The alternatives rejected

- **Deepgram only, as upstream.** A fresh site would deploy unable to
  transcribe until its owner bought a key; Workers AI hosts the same model.
- **The Worker relaying every message** (a WebSocketPair of its own piped to
  the model's). It would let the Worker cap sessions, at a CPU cost per
  message on Workers Free; Cloudflare's own example returns the binding's
  socket, and the origin check is done before it.
- **WebM to Nova-3.** Undocumented on Workers AI's socket; linear16 is what
  Cloudflare's own client sends.
- **Whisper (`@cf/openai/whisper-large-v3-turbo`) in batches.** Not live: the
  page's captions grow word by word only with a real-time model.
