# live-transcription

Speak, and the page captions you live — each word as it is heard, over a
visualiser of your microphone — running on **Cloudflare Workers + Static
Assets** through [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare).
Deepgram's Nova-3 on Workers AI hears you, over a WebSocket the Worker opens
through its own binding, with no key. It is Vercel's
[Next.js Live Transcription](https://github.com/deepgram-starters/nextjs-live-transcription)
template (Deepgram's live-transcription starter), ported to Workers.

## Live deployment

<!-- 02-docs:begin -->
Not recorded yet. The bootstrap's last phase writes the live URLs, the
workspace and the secrets the app uses into
[ai/context/deployment.md](ai/context/deployment.md); how the app deploys
and how to operate it is in
[ai/context/operations.md](ai/context/operations.md).
<!-- 02-docs:end -->

## How a caption is made

1. The page (`app/page.tsx`, `app/components/App.tsx`) asks for the
   microphone and draws its spectrum, then asks `/api/authenticate` which
   service transcribes.
2. With no Deepgram key stored — as the app starts — it opens a WebSocket to
   `/api/listen` (`worker.ts` → `lib/listen.ts`), and the Worker opens
   **Deepgram's Nova-3 on Workers AI** through its `AI` binding and hands the
   page that socket. An AudioWorklet (`public/pcm-capture.worklet.js`) sends
   the microphone as linear16 PCM, at the browser's own sample rate.
3. Nova-3 sends back Deepgram's `Results`: interim transcripts as you speak,
   then a final one when you pause. The page shows each as its caption and
   clears it 3 seconds after you stop.

Workers AI runs on the Cloudflare account the Worker deploys to, and is billed
there per minute of audio (it has a free daily allowance); nothing else is
needed. Only this site's own page may open the socket: another site's page is
refused.

## Use your own Deepgram key

The template ran on Deepgram's own API. With a Deepgram key, this app does
too — the token route mints the browser a short-lived token, and the page
streams to Deepgram directly — and Workers AI is not used:

1. **Create a key** at [console.deepgram.com](https://console.deepgram.com/signup?jump=keys),
   of scope **Member** or higher (a lower scope cannot mint tokens).
2. **Store it**, once per deployed environment. It is this repository's Orun
   secret, and stage and prod can each have their own:

   ```bash
   orun secrets set DEEPGRAM_API_KEY --env stage   # prompts for the value
   orun secrets set DEEPGRAM_API_KEY --env prod
   ```

3. **Redeploy the app**: setting a secret deploys nothing. Use **Deploy by
   hand** below, or change the stamp on the last line of
   `apps/web/component.yaml` (`# orun: redeploy …`) and merge. The deploy
   pushes the key to the Worker as a secret (`live-transcription-web-stage`,
   `live-transcription-web-prod`), never into a build, and the token route reads it
   per request; the key itself never reaches the browser. Delete the secret
   and redeploy to go back to Workers AI.

## What is here

| Surface | Where |
|---|---|
| The page: the microphone visualiser and the live caption | `apps/web/app/page.tsx`, `apps/web/app/components` |
| The microphone | `apps/web/app/context/MicrophoneContextProvider.tsx` |
| The transcription connection (Deepgram's client, or the Workers AI socket) | `apps/web/app/context/DeepgramContextProvider.tsx`, `apps/web/lib/workers-ai-live.ts`, `apps/web/public/pcm-capture.worklet.js` |
| Which service transcribes, and Deepgram's token | `apps/web/app/api/authenticate/route.ts` |
| The transcription socket on Workers AI | `apps/web/worker.ts`, `apps/web/lib/listen.ts` |
| The site's name and source link | `apps/web/app/site.ts` |
| Workers build and deploy contract | `apps/web/next.config.mjs`, `open-next.config.ts`, `wrangler.jsonc`, `component.yaml` |
| Tests | `tests/web` (vitest) |

## Getting started

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build            # next build + opennextjs-cloudflare build → apps/web/.open-next
```

That needs no Cloudflare account and no key, and is what to run before you
push: a pull request builds the app but does not lint or run its tests.
Workers AI has no local mode, so to transcribe on your machine either log in
to Cloudflare and preview the built Worker, or give `next dev` a Deepgram key:

```bash
cd apps/web
npx wrangler login                # Workers AI runs on your account, even in wrangler dev
pnpm build && pnpm preview        # wrangler dev over the built Worker
# — or —
cp .env.example .env.local        # DEEPGRAM_API_KEY
pnpm dev                          # http://localhost:3000, transcribed by Deepgram directly
```

| Variable | Read | What it does |
|---|---|---|
| `AI` (binding) | request time, in the Worker | Workers AI: Nova-3's real-time socket at `/api/listen`. Declared in `wrangler.jsonc`; nothing to provision. |
| `DEEPGRAM_API_KEY` | request time, in the Worker | Optional. Deployed Workers get it from the secret of their environment, pushed by each deploy. Set, the page streams to Deepgram with a short-lived token. |
| `NEXT_PUBLIC_SITE_URL` | build time | The site's public origin, for its metadata and share links. The deploy sets it per environment; not a secret. |

## How it deploys

Merges to `main` converge through [Orun](https://github.com/sourceplane/orun):
`.github/workflows/ci.yml` plans the changed components and runs each lane
against the workspace in `intent.yaml`. The app builds once per environment —
with no Deepgram key in its environment, so no bundle can carry one — then
pushes that environment's key (if one is stored) to the Worker and deploys:
to `stage`, then to `prod` once stage has converged on the same commit; `dev`
only verifies. The Worker is `live-transcription-web-<env>` on your account's
workers.dev subdomain, bound to Workers AI, and every deploy is smoke-tested
over HTTP: the page must render, and the transcription socket must refuse a
plain request (its own 426 — no model is opened, so the smoke costs nothing).
A pull request runs the same pipeline's verify lanes: the app built and
dry-deployed for each environment, with nothing deployed and no secret
pushed. They do not lint or run the tests, so run `pnpm typecheck`,
`pnpm lint` and `pnpm test` before you push. (A push to `main` builds,
deploys and smoke-tests.)

The pipeline holds one credential, GitHub's own `GITHUB_TOKEN`. The
Cloudflare token and account id are brokered per run from the workspace's
Cloudflare connection; nothing provider-shaped is stored in the repository
or in GitHub.

**Deploy by hand.** Orunbase's **Deploy** button on a component, or **Run
workflow** on the CI workflow in GitHub's Actions tab (on `main`), runs
`ci.yml` for the environment and components you pick, and each one deploys
exactly as a merge would deploy it. Leave the component blank to redeploy
every component in that environment, with nothing changed: after storing or
rotating the Deepgram key, say. A component with nothing to run in that
environment (a test suite in `prod`) is left out with a notice.

**Limits.** The microphone needs a secure origin (HTTPS, as workers.dev and a
custom domain are). On Workers AI, Nova-3's real-time minutes are billed to
the account, and the page has no sign-in: anyone who can reach it can
transcribe while it is open, from this site's own page. A session lasts as
long as the page stays open.

## Custom domain

The app answers on workers.dev from its first deploy. To serve it on your
own domain, add the domain to the Cloudflare account the app deploys into
and attach it to the Worker (dashboard → Workers & Pages →
`live-transcription-web-prod` → Settings → Domains & Routes → Add → Custom domain).
The app's share links name its origin, so set
`SITE_URL: https://<your domain>` in that environment's `env:` in
`intent.yaml` — the next deploy builds with it. The repository also names the
domain as `BASE_DOMAIN` in `intent.yaml` (dev, stage and prod), which the app
was born with as the reserved placeholder `live-transcription.example.com`.
Replace it with your domain in the same change.
