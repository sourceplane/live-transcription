# live-transcription

Vercel's [Next.js Live Transcription](https://github.com/deepgram-starters/nextjs-live-transcription)
(template: https://vercel.com/templates/next.js/nextjslive-transcription) —
Deepgram's live-transcription starter: speak, and the page captions you live,
each word as it is heard, over a visualiser of your microphone — running on
**Cloudflare Workers + Static Assets** through
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), deployed by
[Orun](https://github.com/sourceplane/orun) to stage and prod on every merge.
Packaging it as an Orun baseline is the next milestone (LT2). It transcribes from its first deploy, on Workers AI, with no key.

The template's page, contexts and components are the code. What the port adds
is the Workers build, the Worker's own entry, the monorepo wrapper, a test
package and the deploy contract; what it changes is what Workers, and time,
force:

- **The service:** the template needs a Deepgram API key: its
  `/api/authenticate` route mints a short-lived token with it, and the browser
  streams the microphone to Deepgram's own WebSocket. Here, with no key, the
  page streams to the Worker instead: `GET /api/listen` (`apps/web/worker.ts`
  → `lib/listen.ts`) opens **Deepgram's Nova-3 on Workers AI** over a
  WebSocket through the Worker's own `AI` binding
  (`env.AI.run("@cf/deepgram/nova-3", …, { websocket: true })`) and hands that
  socket to the browser. Nova-3 sends Deepgram's own `Results` messages, so
  the template's caption code reads them unchanged. With the owner's optional
  Deepgram key, the route mints a token and the browser streams to Deepgram
  directly, as upstream did.
- **The audio:** Nova-3 on Workers AI takes linear16 PCM, so an AudioWorklet
  (`public/pcm-capture.worklet.js`) taps the microphone's stream at the
  AudioContext's own rate (`lib/workers-ai-live.ts`); Deepgram's own socket
  keeps the MediaRecorder's WebM chunks, as upstream sends them.
- **Next.js 14 → 15.5:** OpenNext 1.20.16 builds Next 15 from 15.5.29, so the
  template moves there, and to React 19 (two type-level changes in its own
  code). See
[`specs/epics/live-transcription`](specs/epics/live-transcription/README.md) for the
design, the milestones and the as-built status.

## What is here (the site)

| Surface | Where |
|---|---|
| The page: the microphone visualiser and the live caption (the template's) | `apps/web/app/page.tsx`, `apps/web/app/components` |
| The microphone (a MediaRecorder, the template's) | `apps/web/app/context/MicrophoneContextProvider.tsx` |
| The transcription connection: Deepgram's own client, or the Workers AI socket | `apps/web/app/context/DeepgramContextProvider.tsx`, `apps/web/lib/workers-ai-live.ts`, `apps/web/public/pcm-capture.worklet.js` |
| Which service transcribes, and Deepgram's short-lived token | `apps/web/app/api/authenticate/route.ts`, `apps/web/lib/env.ts` |
| The transcription socket: Nova-3 on Workers AI through the binding | `apps/web/worker.ts`, `apps/web/lib/listen.ts` |
| The CORS middleware on the token route (the template's) | `apps/web/middleware.ts` |
| The site's name and source link (the rename's seam) | `apps/web/app/site.ts` |
| Workers build and deploy contract | `apps/web/next.config.mjs`, `open-next.config.ts`, `wrangler.jsonc`, `scripts/populate-static-assets-cache.mjs`, `component.yaml`, `tooling/wire/worker-secrets.mjs` |
| Tests | `tests/web` (vitest) |

## Getting started

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build            # next build + opennextjs-cloudflare build → apps/web/.open-next
```

That much needs no Cloudflare account and no key: the baseline's own e2e tier
(`testing/e2e.test.sh`) runs exactly this on each landing before a tag, and an
app's developers run it before a push — an app's pull request builds and
dry-deploys it, and does not lint or run the tests. Workers AI has no local
mode, so to transcribe on your machine either log in to Cloudflare and preview
the built Worker, or give `next dev` a Deepgram key:

```bash
cd apps/web
npx wrangler login                # Workers AI runs on your account, even in wrangler dev
pnpm build && pnpm preview        # wrangler dev over the built Worker (worker.ts and all)
# — or —
cp .env.example .env.local        # DEEPGRAM_API_KEY
pnpm dev                          # http://localhost:3000, transcribed by Deepgram directly
```

| Variable | Where it is read | What it does |
|---|---|---|
| `AI` (binding) | request time, in the Worker (`worker.ts`, `getCloudflareContext().env`) | Workers AI: Nova-3's real-time socket at `/api/listen`. Declared in `wrangler.jsonc`; nothing to provision. Absent under `next dev`, where the token route answers 503 unless a Deepgram key is set. |
| `DEEPGRAM_API_KEY` | request time, in the Worker (`process.env` under `next dev`) | Optional; Member scope or higher. A deploy pushes its environment's secret to the Worker, best-effort; the build never has it, nor the browser. Set, the token route mints the browser a short-lived Deepgram token and the page streams to Deepgram. |
| `NEXT_PUBLIC_SITE_URL` | build time (Next.js inlines it into `app/site.ts`) | The site's public origin, for `metadataBase` and the share links. The deploy sets it per environment: `SITE_URL` when `intent.yaml` sets one, else the Worker's workers.dev URL. |

## How it maps to Vercel

| Vercel | Here |
|---|---|
| Next.js hosting (the pre-rendered page, the route handler, the edge middleware) | One Cloudflare Worker — `worker.ts` in front of `.open-next/worker.js` — + Static Assets; the page pre-rendered at build and served from the static-assets cache, which the build fills itself (`scripts/populate-static-assets-cache.mjs`: OpenNext's own `populateCache` would open a Cloudflare session for the AI binding); the middleware runs as it did |
| `DEEPGRAM_API_KEY` in the project's environment, required: `/api/authenticate` mints a token, the browser streams to Deepgram | No key needed: `/api/listen` opens Deepgram's Nova-3 on Workers AI through the Worker's `AI` binding and hands its WebSocket to the browser, which streams linear16 PCM from an AudioWorklet. With the owner's optional key, the token route and Deepgram's own socket, as upstream |
| The key read from the server's environment | An optional Orun secret, unset for the build (`env -u`) and pushed to the Worker as a secret after it (`tooling/wire/worker-secrets.mjs`), read per request; never sent to the browser |
| `DEEPGRAM_ENV=development` handing the raw key to the browser | Not carried (the page could not use it: it reads `access_token`) |
| Errors answered as 200 JSON | 502 (Deepgram refused the key, its message shown) and 503 (nothing connected), never cached |
| `next/font/google` (Inter) | `@fontsource-variable/inter` through `next/font/local`: `next/font/google` fails on GitHub's runners |
| Next.js 14, React 18 | Next.js 15.5.29 (OpenNext's floor on the 15 line), React 19 |
| The share links and star button on Deepgram's demo and repository | The site's own origin and repository (`app/site.ts`) |
| Deploy on push | Orun deploys `<repo>-web-{stage,prod}` on merge to `main` and smoke-tests it (`apps/web/component.yaml`) |

## CI

| Workflow | What it runs | Ships to an app |
|---|---|---|
| `ci.yml` | the Orun pipeline, and the only workflow an app carries: `orun plan --changed`, then one job per lane. A pull request runs the verify lanes (the app built and dry-deployed per environment; they do not lint or run the tests), except the bootstrap's own landings (`orun/BASE-*`), where `plan` alone is the check; a merge deploys stage → prod. It plans nothing while `intent.yaml` names the placeholder workspace `ws_CHANGE_ME`, as this repository does. A manual run (Orunbase's Deploy button, or Run workflow on `main`) plans the environment and components it names under the push-to-main trigger, so they deploy as a merge deploys them | yes |
