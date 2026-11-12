# live-transcription — operating contract (for humans and agents)

This is the standing guide to how this app is deployed and operated.
Instance facts (live URLs, workspace, the secrets it uses) live in
[deployment.md](deployment.md), rendered from probed reality by the
bootstrap's `02-docs` phase; this file is the contract that stays true
between deployments. It is written to give an agent with repository read
access enough context to reason about and operate the app without any
other source.

## What this system is

A live-transcription page served from Cloudflare — the microphone in, its
captions out as you speak — expressed as an Orun component-native
desired-state repo.

- **`apps/web`** — Next.js built by `@opennextjs/cloudflare` into one Worker
  plus Static Assets, behind the Worker's own entry (`worker.ts`). `/` is the
  template's page, pre-rendered at build: the microphone's visualiser and the
  live caption. `GET /api/authenticate` tells the page which service
  transcribes (and, with a Deepgram key stored, mints it a short-lived
  token); `GET /api/listen`, answered by `worker.ts` before Next.js, opens
  Deepgram's Nova-3 on Workers AI over a WebSocket through the `AI` binding
  and hands the page that socket.
- **`tests/web`** — vitest over the socket handler and the token route
  (against Workers AI and Deepgram stand-ins), the browser's socket client
  and its PCM worklet, the template's caption handling in jsdom, and the
  site's identity. No lane lints or runs the tests: a pull request builds and
  dry-deploys the app, so run `pnpm typecheck && pnpm lint && pnpm test`
  before you push.
- **`tooling/*`** — shared TypeScript and ESLint configuration, the Worker
  secrets pusher, and the wrangler renderer for a deployable that comes to
  take wiring.

There is no infrastructure component: Workers AI is a binding on the account
the Worker deploys to (declared in `apps/web/wrangler.jsonc`, nothing to
provision), and Deepgram a hosted API.

Environments: **`stage`** and **`prod`** are deployed; **`dev` is
verify-only by design** — lanes build and dry-deploy, nothing deploys.

## Transcription: Workers AI, or Deepgram

With no key stored, the page transcribes on **Workers AI**: its AudioWorklet
streams the microphone as linear16 PCM to `/api/listen`, the Worker opens
`@cf/deepgram/nova-3` in real-time mode through its binding, and Nova-3 sends
Deepgram's `Results` back — interim transcripts, then a final one at each
pause — billed to the Cloudflare account per minute of audio. Only this
site's own page may open the socket (`apps/web/lib/listen.ts`); Nova-3's
options are there too.

To transcribe with **Deepgram's own API** instead, as the template did:

```bash
# 1. per deployed environment: a Deepgram key, Member scope or higher
orun secrets set DEEPGRAM_API_KEY --env stage    # prompts for the value
# …and the same with --env prod

# 2. redeploy apps/web: the deploy pushes it to the Worker as a secret
#    (tooling/wire/worker-secrets.mjs), and setting a secret deploys nothing.
#    Deploy by hand, or change the stamp on the last line of
#    apps/web/component.yaml (`# orun: redeploy <reason> <stamp>`) and merge.
```

The key is read best-effort (`optionalSecretEnv` in
`apps/web/component.yaml`): a key nobody has stored is skipped, never a
failed lane. A key of too low a scope is not caught at deploy: the token
route answers 502 with Deepgram's refusal and the page shows it as its
caption, so speak to the page after storing one. Delete the secret and
redeploy to go back to Workers AI.

## Identity and tenancy

Every remote operation runs against ONE Orun workspace, declared in
`intent.yaml` under `execution.state.workspace` — committed, enforced, and
what CI uses. Do not remove it; headless credentials depend on it. If it
reads `ws_SET_ME`, the bootstrap had no workspace to write: set the real one
before anything else.

## How deployment works

1. Merge (or push) to `main`.
2. CI (`.github/workflows/ci.yml`) runs `orun plan --changed` — only
   components whose files changed are planned — then runs each planned lane
   with `orun run --remote-state`, authenticated by GitHub OIDC (the
   exchange resolves this repository's linked workspace server-side).
3. `apps/web` checks its committed `wrangler.jsonc` is there, builds once per
   environment with no Deepgram key in its environment (`env -u`), pushes
   that environment's key to the Worker (if one is stored), `wrangler deploy`
   ships `live-transcription-web-<env>` (`worker.ts` over the OpenNext build)
   bound to Workers AI, and a smoke test fetches `/` and requires the
   template's "Powered by Deepgram" caption, then requires the transcription
   socket to refuse a plain request with its own 426 — proof the Worker's own
   entry answers, with no model opened.
4. `prod` deploys after `stage` has converged on the same commit
   (`environments.prod.promotion` in intent.yaml).
5. **The convergence run is the deployment.** A green run means every
   planned lane passed. Failed lanes are retried with
   `gh run rerun --failed`, which resumes the same execution.

On a pull request nothing deploys: the app builds and dry-deploys.

Caveats that matter:

- A push that touches no component files plans zero lanes — that run is
  green and deployed nothing. Never treat "latest run green" as "app
  converged"; probe the URLs instead.
- A change to `intent.yaml`'s `environments`, or to an Orun secret, maps to
  no component and redeploys nothing on its own. Land it with a change under
  `apps/web`.
- The page has no sign-in: anyone who reaches it can transcribe from it,
  billed to the account (Workers AI) or the key (Deepgram).

## Secrets model

- **Brokered provider secrets**: `CLOUDFLARE_API_TOKEN` (the
  `workers-deploy` scope) and `CLOUDFLARE_ACCOUNT_ID` — pointers minted per
  run from the workspace's Cloudflare connection. No long-lived values at
  rest; nothing to rotate by hand.
- **Workers AI** needs no secret: the binding runs on the deploying account.
- **The Deepgram key**: `DEEPGRAM_API_KEY` on `stage` and `prod`, optional,
  stored by the owner, pushed to the Worker as a secret by each deploy and
  read per request to mint short-lived tokens; no build sees it, nor the
  browser.
- Inspect by NAME only: `orun secrets list --org <ws> --env stage|prod`. No
  tooling in this repository prints a secret value, and no document in
  `ai/context/` may contain one.

## Verifying the system

```bash
# the app on each environment (also recorded, probed, in deployment.md)
curl -s https://live-transcription-web-stage.your-workers-subdomain.workers.dev/ | grep -o 'Powered by Deepgram'
curl -s -o /dev/null -w '%{http_code}\n' https://live-transcription-web-prod.your-workers-subdomain.workers.dev/
# the transcription socket refuses a plain request, before any model: 426
curl -s -o /dev/null -w '%{http_code}\n' \
  'https://live-transcription-web-prod.your-workers-subdomain.workers.dev/api/listen?sample_rate=16000'
# which service transcribes (workers-ai, or deepgram once a key is stored)
curl -s https://live-transcription-web-prod.your-workers-subdomain.workers.dev/api/authenticate

# workspace readiness
orun secrets list --org <ws> --env stage && orun secrets list --org <ws> --env prod
orun integrations list --org <ws> --json && orun cloud check --org <ws>
```

To check a model really hears speech, open the page, allow the microphone
and speak: that is the one thing no probe here does, because it spends.

## Common operations

| task | how |
|---|---|
| transcribe with Deepgram | "Transcription: Workers AI, or Deepgram" above |
| change Nova-3's options | `apps/web/lib/listen.ts` (`listenParams`) for Workers AI, `apps/web/app/components/App.tsx` (`connectToDeepgram({...})`) for Deepgram; merge |
| change the app's code | edit `apps/web` (its name: `apps/web/app/site.ts`), merge |
| deploy a change | merge to `main`; watch the run; failed lanes → `gh run rerun --failed` |
| deploy by hand | Orunbase's Deploy button, or `gh workflow run ci.yml --ref main -f environment=<env> [-f component=<a,b>]` — the named components (blank: every one) run in that environment as a merge runs them; started off `main` it is refused |
| redeploy without a change | edit the last line of `apps/web/component.yaml` (`# orun: redeploy <reason> <stamp>`) and merge — it is a deploy trigger, nothing reads it |
| serve a custom domain | attach it to the Worker in Cloudflare (README, "Custom domain"), set `SITE_URL` in that environment's `env:` in `intent.yaml`, then replace the placeholder `live-transcription.example.com` in `intent.yaml`'s `BASE_DOMAIN` (dev, stage and prod) with it |
| headless credentials | `ORUN_TOKEN` (workspace-scoped) + `GITHUB_TOKEN` |

The deployment record is the bootstrap's `02-docs` phase. Re-running it (the
Orun console's Retry on that phase, or `orun new … --phase 02-docs`)
re-probes the URLs and re-renders [deployment.md](deployment.md); it is
idempotent.

## Evolution

Structural changes follow the same contract that deployed the app: add a
component under `apps/`, `infra/` or `packages/` with a `component.yaml`,
land it as a pull request, and the convergence run deploys it. A component
under `infra/` whose wiring the Worker reads is declared in `apps/web`'s
`dependsOn` (enforced on `main`), so it is applied first.
