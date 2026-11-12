# live-transcription — implementation plan

Three milestones, each one pull request into `main`, squash-merged once its
CI is green.

## LT0 — the spec (LT-1)

The repository is born with its intent, CI, tooling and spec index, and this
doc set (epic.yaml, README, design, this plan, risks, status) and the three
task contracts land.

Done when the doc set and contracts are on `main`.

## LT1 — the captions on Workers (LT-2)

- `apps/web`: the upstream template — its page, its microphone and Deepgram
  contexts, its components, fonts, images and CORS middleware — on Next
  15.5.29 and React 19 with OpenNext 1.20.16; the site seam (`app/site.ts`:
  the name, the source link, the origin for the share links).
- `worker.ts` (wrangler's `main`) and `lib/listen.ts`: the transcription
  socket, answered before Next.js, opening Nova-3 on Workers AI through the
  binding, with its refusals.
- `lib/workers-ai-live.ts` and `public/pcm-capture.worklet.js`: the browser's
  socket client, speaking Deepgram's LiveClient interface, and the linear16
  PCM it streams; the Deepgram context choosing between it and Deepgram's own
  client by what `/api/authenticate` answers.
- The token route on the Worker's env, the Deepgram key an optional secret
  pushed by `tooling/wire/worker-secrets.mjs`.
- `tests/web`: the socket handler, the token route, the client and the
  worklet against stand-ins, the template's caption handling in jsdom, the
  site.
- The README and its "How it maps to Vercel" table.

Done when `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` are
green and `wrangler dev` captions a recording over the socket from a Nova-3
stand-in (and mints a token from a Deepgram stand-in with a key).

## LT2 — a baseline (LT-3)

- `blueprint.yaml` (the card), `repo-blueprint.yaml` (two phases, one
  landing), `.baseline/` (identity, task contracts, the product README).
- `tooling/rebrand` (the identity, the upstream's names and Deepgram's SDK
  names protected), `hooks/render-deployment-docs.sh` (the record, the
  standard library only), `ai/context`, `docs/phases`, `BOOTSTRAP.md`.
- `testing/`: manifest, phases, coverage, rebrand, retouch, bootstrap-defer,
  render, leak, placement and the e2e with its in-process stand-ins and the
  page in headless Chrome; the component docs generated.

Done when every Baseline CI tier is green, then `baseline-v1` is cut.
