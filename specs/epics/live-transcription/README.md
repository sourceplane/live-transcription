# live-transcription — Vercel's Next.js Live Transcription on Cloudflare Workers

**Deepgram's live-transcription starter — speak, and the page captions you
live — served by one Cloudflare Worker that opens Deepgram's Nova-3 on Workers
AI over a WebSocket through its own binding with no key, deployed by Orun to
stage and prod on every merge, and the baseline that makes a copy of it
somebody else's in one landing.**

| | |
|---|---|
| Status | In progress — LT1 on main: the site runs on Workers |
| Upstream | [deepgram-starters/nextjs-live-transcription](https://github.com/deepgram-starters/nextjs-live-transcription) (MIT, © 2023 Deepgram), at `6c88264` (2026-11-06) — Vercel's "Next.js Live Transcription" template |
| Reference | [pdf-quiz-generator](https://github.com/sourceplane/pdf-quiz-generator) — the same scaffolding, tests, bootstrap, Workers AI through the binding with an optional key pushed to the Worker after the build, and the e2e's own Worker entry; [nitro-websockets](https://github.com/sourceplane/nitro-websockets) — WebSockets on Workers, tested with real clients |
| Key | `LT` |

Vercel's [Next.js Live Transcription](https://github.com/deepgram-starters/nextjs-live-transcription)
(deepgram-starters/nextjs-live-transcription, MIT) is Deepgram's starter: the
page asks for the microphone, mints a short-lived Deepgram token through
`/api/authenticate`, streams the microphone to Deepgram's live WebSocket and
captions what comes back. It needs a Deepgram key. This epic runs it on
Cloudflare Workers + Static Assets through `@opennextjs/cloudflare`, and with
no key the Worker's own entry opens Deepgram's Nova-3 on Workers AI over a
WebSocket through its binding instead — so a new site transcribes from its
first deploy — and packages it as an Orun baseline that takes a new
transcription site from nothing to live on stage and prod in one landing.

With the owner's optional Deepgram key, the page streams to Deepgram directly,
as upstream did.

## Read in this order

| Page | What it answers |
|---|---|
| [design.md](design.md) | how the template maps to Workers, the socket on Workers AI and the audio it takes, the repository and the build |
| [implementation-plan.md](implementation-plan.md) | the three milestones and what each one ships |
| [risks-and-open-questions.md](risks-and-open-questions.md) | what is not yet proven, and what is accepted |
| [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) | what shipped, and every departure from upstream |

## Milestones

| Milestone | What it lands | Task |
|---|---|---|
| LT0 — the spec | the repository, its intent, CI, tooling and spec index; this doc set | LT-1 |
| LT1 — the captions on Workers | the template in `apps/web`, built by OpenNext into one Worker behind `worker.ts` bound to Workers AI, the Deepgram key read per request; `tests/web` | LT-2 |
| LT2 — a baseline | the console card, the build document, the context pack and the baseline's tests | LT-3 |
