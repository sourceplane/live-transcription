# live-transcription — where this repository stands

The entry page for anyone (or any agent) picking this repository up. It is
this repository's own state and does not ship to an app built from it; the
two pages that do are [operations.md](operations.md) and
[deployment.md](deployment.md).

## What it is

Vercel's Next.js Live Transcription (Deepgram's starter) on Cloudflare Workers
+ Static Assets (`@opennextjs/cloudflare`) — the page captions the microphone
live, and with no key the Worker's own entry opens Deepgram's Nova-3 on
Workers AI over a WebSocket through its `AI` binding and hands the page that
socket — packaged as an Orun baseline: `orun new --blueprint
repo-blueprint.yaml` builds a new app in its own repository and takes it to
live on stage and prod in one landing (`01-product`), then records what went
live (`02-docs`). With the owner's optional Deepgram key, the page streams to
Deepgram directly with a short-lived token, as upstream did. There is no
infra component: Workers AI is a binding with nothing to provision.

## Release

| | |
|---|---|
| Latest tag | `baseline-v1` (LT2 — the baseline, one landing) |
| Proven live | No. Everything short of the platform is proven offline in Baseline CI, on in-process stand-ins for Nova-3's real-time socket and Deepgram's token grant (and the page in headless Chrome on Linux); a live bootstrap (risk LT-A) and a real model hearing speech (risk LT-B) are still to come |

## Where to read

| Question | Page |
|---|---|
| What shipped, and every departure from upstream | `specs/epics/live-transcription/IMPLEMENTATION-STATUS.md` |
| Why it is built this way | [decisions.md](decisions.md), then `specs/epics/live-transcription/design.md` |
| What could still go wrong | [open-risks.md](open-risks.md), then `specs/epics/live-transcription/risks-and-open-questions.md` |
| How to instantiate it | `BOOTSTRAP.md`, `docs/phases/` |
| What each component is | `apps/web/docs/`, `tests/web/docs/` (generated; `python3 tooling/catalog/gen-component-docs.py`) |

## Next

1. Bootstrap one app from `baseline-v1` against a workspace, and record its
   timings (closes LT-A).
2. Speak to it on Workers AI, and once with a Deepgram key (closes LT-B).
