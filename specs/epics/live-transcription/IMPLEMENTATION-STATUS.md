# live-transcription — implementation status

| Milestone | State | Landed |
|---|---|---|
| LT0 — the spec | ✅ | the repository's first commit, LT-1 |
| LT1 — the captions on Workers | ✅ | LT-2 |
| LT2 — a baseline | planned | LT-3 |

## Departures from the upstream template

1. **Next** 14 (`^14.1.3`) → **15.5.29**, with **@opennextjs/cloudflare
   1.20.16** (its floor on the 15 line; 14 is refused), both pinned; **React**
   18 → **19**: `React.JSX.Element` for the global `JSX.Element`, and
   `useRef<any>(undefined)` (React 19's `useRef` takes an argument) — the
   only changes to `App.tsx`'s own code.
2. **Transcription with no key on Workers AI**: `worker.ts` (wrangler's
   `main`) answers `GET /api/listen` before Next.js and opens Deepgram's
   **Nova-3 on Workers AI** over a WebSocket through the `AI` binding
   (`lib/listen.ts`), returning the model's socket to the browser; it refuses
   a plain request (426), another site's page (403), a bad rate (400).
3. **The browser's audio on Workers AI** is linear16 PCM from an AudioWorklet
   (`public/pcm-capture.worklet.js`), at the AudioContext's rate, through
   `lib/workers-ai-live.ts`, a client speaking Deepgram's LiveClient
   interface; with a Deepgram key, the MediaRecorder's WebM to Deepgram, as
   upstream.
4. **`/api/authenticate`** names the service (`workers-ai`, `deepgram` with a
   token, or `none`), reads the key per request from the Worker's env, and
   answers errors as 502 (Deepgram's refusal, its `err_msg`) and 503 (nothing
   connected) instead of 200; upstream's `DEEPGRAM_ENV=development` branch,
   which answered the raw key, is not carried.
5. **The Deepgram context** gains a `notice` (why nothing is connected),
   which `App.tsx` shows in place of its caption.
6. **The site seam** (`app/site.ts`): the title reads `SITE_NAME` ("Live
   Transcription"; upstream's title was a leftover, "Deepgram AI Agent");
   the GitHub star button names the product's repository (`SOURCE_URL`), and
   the three share links the site's own origin (`SITE_URL`) instead of
   Deepgram's demo; `metadataBase` is the environment's origin.
7. **Fonts**: `next/font/google` (Inter) → `@fontsource-variable/inter`
   (SIL OFL 1.1) through `next/font/local`; ABC Favorit kept as upstream ships
   it.
8. **The logo's full-reload link** (`<a href="/">`) kept, with one reasoned
   ESLint disable: Next 15's `no-html-link-for-pages` now checks `app/`.
9. **Not carried**: `react-device-detect` and `react-syntax-highlighter`
   (nothing imports them); semantic-release, commitlint, husky and the
   release workflow; `deepgram.toml`, `sample.env.local` (now
   `.env.example`), the issue and PR templates, the changelog and the
   project's community files.
10. **Lint**: the template's `.eslintrc.json` (`next/core-web-vitals`) as an
    ESLint 9 flat config through FlatCompat; `next lint` kept.
11. **The build** copies the static-assets cache itself
    (`scripts/populate-static-assets-cache.mjs`) instead of
    `opennextjs-cloudflare populateCache local`, which asks for a Cloudflare
    credential once an AI binding is declared.
12. **Workspace**: pnpm 10.12.1 (upstream: npm), `next.config.mjs` with
    `output: "standalone"`, `outputFileTracingRoot`, `images.unoptimized` and
    the preview origins; `tsconfig.json` excludes the OpenNext config and
    build output.
13. **Tests**: the template ships none; `tests/web` adds them (31). Its
    tsconfig checks the app files it imports with the app's own settings
    (`noUncheckedIndexedAccess` off: upstream reads `alternatives[0]`).

## Verified

- The spike under `wrangler dev`, with the e2e's entry: the page under its
  name, the token route (Workers AI; a token minted from a key; a refused key
  → 502), the socket's refusals, and an 8.4 s recording streamed as 84
  chunks of linear16 — all 268,800 bytes heard, 15 interim and 3 final
  captions back, a clean close.
- The Worker: 5,504 KiB raw, about 1,160 KiB gzipped — Workers Free's 3 MiB.
- Not verified: a real model hearing speech (risk LT-B), a live deploy
  (LT-A); the page in a real browser on macOS (LT-J: it runs on Linux CI).
