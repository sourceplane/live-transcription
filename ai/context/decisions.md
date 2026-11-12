# live-transcription — decisions

The choices that shape this repository, one line each, with where the full
reasoning lives. Superseded decisions stay listed, marked, so the history
reads in order.

| # | Decision | Why | Source |
|---|---|---|---|
| 1 | OpenNext on Workers + Static Assets (`cloudflare-workers-assets-turbo`), the static-assets incremental cache; no R2 or Durable Object cache | Nothing is revalidated: the page is pre-rendered once, the token route runs per request | `specs/epics/live-transcription/design.md` §2 |
| 2 | The build fills the static-assets cache itself (`apps/web/scripts/populate-static-assets-cache.mjs`), not with `opennextjs-cloudflare populateCache local` | That command opens wrangler's platform proxy over `wrangler.jsonc`, and the AI binding (no local simulator) makes it ask for a Cloudflare credential; a build needs none (the AI-binding baselines' pattern) | design.md §2 |
| 3 | Workers AI is the default: `/api/listen` opens `@cf/deepgram/nova-3` with `env.AI.run(…, { websocket: true })` and returns that Response — the model's socket — to the browser as its 101 | A key-free default transcribes from the first deploy; Nova-3 on Workers AI sends Deepgram's own `Results`, which the template's caption code reads unchanged | design.md §3 |
| 4 | `wrangler.jsonc`'s `main` is `worker.ts`, which answers `/api/listen` before handing every other request to `.open-next/worker.js` | A Next.js route handler cannot answer a WebSocket upgrade through OpenNext | design.md §3 |
| 5 | The page streams linear16 PCM from an AudioWorklet at the AudioContext's own rate (`?sample_rate=`), while Deepgram's own socket keeps the MediaRecorder's WebM | Cloudflare's own Nova-3 client (`agents`' voice transcriber) sends linear16; container audio on Workers AI's socket is undocumented | design.md §3, risk LT-B |
| 6 | The socket refuses before the model: no upgrade (426), another site's page (403), a rate outside 8–48 kHz (400) | The page has no sign-in; only this site's page may spend the account's Workers AI, and a refusal must not | design.md §4 |
| 7 | `DEEPGRAM_API_KEY` is `optionalSecretEnv`, unset for the build (`env -u`) and pushed to the Worker as a secret after it; with it, the token route mints a short-lived token with upstream's `grantToken` | A required ref fails the lane before its first step on a fresh product; a key read per request never sits in a bundle, nor in the browser (algolia-search's pattern) | design.md §3 |
| 8 | Upstream's `DEEPGRAM_ENV=development` branch, which handed the raw key to the browser, is not carried; errors are 502/503, not 200 | The page could not use a raw key (it reads `access_token`); a key must never leave the Worker | design.md §3 |
| 9 | Next 15.5.29 with @opennextjs/cloudflare 1.20.16, both pinned; React 19 | 1.20.16's peer range is `>=15.5.29 <16 || >=16.4.5`; Next 14 is refused | risk LT-G |
| 10 | The rename protects upstream's own names (`nextjs-live-transcription`, the Vercel page `…/nextjslive-transcription`) and allows Deepgram's SDK identifiers (`LiveTranscriptionEvents`) | Both spell this baseline's slug or its Pascal form; renaming them would credit a repository that does not exist or break the SDK import | `tooling/rebrand/rebrand.mjs` |
| 11 | Two phases, one landing (`01-product`, `02-docs`), no infra component | A landing has a fixed cost (cirrus-baseline since baseline-v22); the app provisions nothing | design.md §5 |
| 12 | `ci.yml` plans nothing while `intent.yaml` names `ws_CHANGE_ME`; stack-tectonic 0.19.0, not 0.20.0 | A bootstrap cannot set a repository variable; 0.20.0's out-of-tree `node_modules` is refused by Turbopack on a Next 16 move | risk LT-I |
| 13 | The e2e serves the built Worker through its own entry with in-process stand-ins for Nova-3's socket and Deepgram's grant, and drives the page in headless Chrome with a fake microphone on Linux | Workers AI has no local mode and Deepgram needs a key; a test seam does not belong in the product; macOS headless Chrome's capture never resolves | design.md §6 |
| 14 | Component docs are generated from the manifests and checked in CI | A hand-written copy of the dependency graph and bindings drifts silently | `tooling/catalog/gen-component-docs.py` |
| 15 | The workers.dev subdomain is read from the Cloudflare connection; the console asks for no domain, and an empty `productdomain` brands the placeholder `<reponame>.example.com` | One right answer for the subdomain; a domain is an owner's step after the bootstrap | `blueprint.yaml`, `tooling/rebrand/rebrand.mjs` |
| 16 | The deployment-record hook uses the Python standard library only, tested without PyYAML | The console's build box has python3 but not PyYAML (orun-cloud#2344) | `testing/render.test.sh` |
