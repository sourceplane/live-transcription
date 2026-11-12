# BOOTSTRAP — a new live-transcription app from this baseline, in one landing

How to go from **nothing** to **a Next.js live-transcription page live on
stage and prod, transcribing on Workers AI, documented**, with ONE provider
consent — and how its owner may then move it to Deepgram's own API.

There is one artifact: **`repo-blueprint.yaml`**. It declares what to place,
in what order, what each phase needs first, and what to say while it runs.
`orun new` is the whole runtime — the phases below are its `--phase` names,
not separate workflows. The console card the platform renders is
**`blueprint.yaml`**; it names the build document and states the inputs, the
brokered secrets and the programme, and `testing/manifest.test.sh` holds it
to what the build document does.

Target wall-clock: **about twelve minutes** — an estimate summed from the
phases (11 + 1) until a bootstrap on this shape measures it. The shape: the
task set-up in the background while ONE landing places the whole app,
brands it and checks it in the box (`orun validate` and `orun plan`, no
runner waited for — its pull request no longer waits on a full Next.js build
in Checks), then one convergence that builds and deploys it to stage and
prod side by side, then a short docs landing that records it. It is
cirrus-baseline's one-landing shape (baseline-v22): no scaffold landing of
its own, no second landing for the app.

## 0. What you need

- GitHub org access (repository creation) and a machine with `git`, `node`
  (≥ 22), `pnpm` (10.12.1), `python3` with PyYAML, `curl`, and the `orun`
  CLI **≥ v2.88.0** — the floor for RUNNING the bootstrap (the phase overlay,
  landings that commit per phase, `githubOwner` on the doctor probe, a probe
  deferred for a project not yet created, `from: workspace`, the deploy
  credentials minted in one `secrets` reconcile, the task set-up run in the
  background (`background: true`), and landings checked in the box before
  they merge (`checks: local`)). The app's own `ci.yml` pins its lanes
  separately (v2.78.4).
- A Cloudflare account (the free plan is enough for one Worker with Static
  Assets) and its **Account API token** with Workers Scripts Write (the
  console's Connect recipe lists the exact permission groups). It is the ONLY
  provider credential the bootstrap needs.
- **No speech key.** The page transcribes on Workers AI — Deepgram's Nova-3
  over a WebSocket the Worker opens through its `AI` binding — on the same
  Cloudflare account, with nothing to provision and no key; Workers AI usage
  is billed to that account per minute of audio (it has a free daily
  allowance). Deepgram is not a provider the platform brokers, so the
  bootstrap asks for no Deepgram key: its owner may store one afterwards (§3).
- An Orun Cloud workspace for the app — `orunWorkspace`, or the workspace
  the build runs in (ORUN_WORKSPACE) when that is unset — with an
  **admin-role API key** for headless runs (secret writes below admin are
  masked as `not_found`).
- **The repository allow-listed in the workspace** (console → Settings → Git
  repos), unless the credential can write links. `01-product`'s `link` step
  stops and names the fix if it is not.

## 1. One command: `--resume`

The whole bootstrap, unattended. `--resume` places every phase not already
derived as done, in order, honouring each phase's barrier:

```bash
git clone --depth 1 --branch <baseline-tag> https://github.com/sourceplane/live-transcription
cd live-transcription

orun new --blueprint repo-blueprint.yaml \
  --out ~/apps/acme-notes --run-hooks --resume \
  --set reponame=acme-notes --set productname="Acme Notes" \
  --set githuborg=acme-inc \
  --set orunWorkspace=ws_XXXXXXXX \
  --set subdomain=<workers-dev-subdomain>
```

`subdomain` is the workers.dev subdomain of the Cloudflare account you deploy
into (Workers & Pages → your subdomain). A build started from the console, or
with `orun baseline new --from bst_…`, never asks for it: the platform reads
it from the workspace's Cloudflare connection, the same one the deploy token
is minted from. Only a hand-run build like this one passes it.

**`--run-hooks` is the difference between placing files and bootstrapping a
app.** Without it `orun new` writes the tree and stops: no repository, no
landing, no convergence watch, no probe. That is deliberate — it is what
makes the offline bootstrap in `testing/` possible with no workspace and no
provider.

`--resume` is safe to re-run from anywhere, a fresh container with a fresh
`--out` included: **phase state is derived from the tree, never stored.** A
phase whose files are present but branded derives as `drifted`, and
`--resume` leaves it placed rather than reverting the app's identity.

## 1b. Or phase by phase

| phase | what it lands | verified by |
|---|---|---|
| `01-product` | the repository, created and linked; the WHOLE app in one PR — intent, CI, tooling, identity, `apps/web` + `tests/web`; the brokered Cloudflare secrets | its commit validated and planned in the box (as the PR and as the merge), then merged; the convergence green (build, deploy, smoke) and the app answering on both workers.dev URLs |
| `02-docs` | `ai/context/deployment.md` from probed facts; prod's promotion gate and dev's push lanes restored | the render's own probes, recorded; the commit checked in the box and merged |

```bash
orun new --blueprint repo-blueprint.yaml --out ~/apps/acme-notes --run-hooks \
  --phase 01-product --values ~/acme-notes.values.yaml
# … then 02-docs
```

`02-docs` reads the identity back from `.rebrand/values.json` in the placed
tree, but the blueprint's **required** inputs — `reponame`, `productname`,
`githuborg` — are validated before anything runs, so pass them every time (a
`--values` file is easier). The domain is not one of them: the app goes live
on workers.dev, and `productdomain` defaults to empty, which brands the
reserved placeholder `<reponame>.example.com` into `BASE_DOMAIN` for an owner
to replace when they attach a domain (README, "Custom domain"). Pass
`--set productdomain=` only for an app that already has its domain.
The full guide, one page per phase: [docs/phases/README.md](docs/phases/README.md).

| flag | what it does |
|---|---|
| `--status` | derives and prints every phase's state and writes nothing. It parses the document, validates each hook against the action registry and compiles every template; it needs no credential and no network |
| `--phase <name>` | places exactly that phase; its `requires.phases` still gates |
| `--until <name>` | places every phase through that one and stops |

What lands in the app is PRODUCT-ONLY: the app, its tests, its CI, its
tooling, its README and its two context pages. None of this repository's
machinery (`.baseline/`, the blueprints, `tooling/rebrand`,
`tooling/bootstrap`, `hooks/`, `testing/`, `docs/phases/`, `specs/`,
`tasks/`, this file) ships, and no file that does ship names any of them.
That promise is a test: `testing/leak.test.sh` derives what every phase would
place and gates the set and its contents, and `testing/placement.test.sh`
gates the same rules over a placed, branded tree.

## 2. Headless / container mode

The blueprint's source is this repository (`sources: [{kind: dir, path: .}]`),
so the container contract is a shallow clone at a pinned tag plus two
tokens:

```bash
export ORUN_TOKEN=…          # orun auth, headless
export GITHUB_TOKEN=…        # fine-grained PAT (below)

git clone --depth 1 --branch <baseline-tag> https://github.com/sourceplane/live-transcription
cd live-transcription
orun new --blueprint repo-blueprint.yaml \
  --out /work/acme-notes --run-hooks --resume --progress json \
  --values /work/acme-notes.values.yaml
```

| requirement | detail |
|---|---|
| `GITHUB_TOKEN` | fine-grained PAT: **read** on this repository; on the app's repository **contents write**, **pull-requests write**, **actions read+write** (`orun.run/watch@v1` resumes runs with `gh run rerun`), **checks read**; **repository create** on the owner if `01-product` creates it (or pre-create it — supported) |
| classic token caveat | a classic PAT or gh OAuth token also needs the `workflow` scope to push `.github/workflows/` |
| pinning | the clone's `--branch <tag>` pins everything: the blueprint, its modules and its hooks' scripts all come from that one commit |

## 3. After the app is live: speak to it, and Deepgram if you want it

The bootstrap ends with an app that is live and smoke-tested — the smoke
opens no model, so the first caption is yours to make: open the page, allow
the microphone and speak. That is the one check that spends (Workers AI on
the account, per minute of audio).

To transcribe with Deepgram's own API instead (as the template did), the
app's README, "Use your own Deepgram key", has the steps; in short:

```bash
orun secrets set DEEPGRAM_API_KEY --env stage   # per environment: a Deepgram key, Member scope or higher
# then redeploy apps/web — it pushes the key to <reponame>-web-stage as a
# Worker secret: Deploy by hand, or change the stamp on the last line of
# apps/web/component.yaml (`# orun: redeploy …`) and merge
```

The key is an optional reference in `apps/web/component.yaml`
(`optionalSecretEnv`): until it exists, the lane skips it; once it does, the
next deploy pushes it to the Worker, and the token route reads it per request
to mint the browser a short-lived Deepgram token (the key never leaves the
Worker).

- **Build on it**: the app is `apps/web`; the caption code is
  `apps/web/app/components/App.tsx`, the connection
  `apps/web/app/context/DeepgramContextProvider.tsx`, and the Workers AI
  socket `apps/web/worker.ts` and `apps/web/lib/listen.ts` (Nova-3's options
  are there).
- **Custom domain**: attach it to the Worker in Cloudflare, set `SITE_URL`
  in that environment's `env:` in `intent.yaml`, and replace the placeholder
  `<reponame>.example.com` in `intent.yaml`'s `BASE_DOMAIN` with it (the
  app's README, "Custom domain"). There is no domain phase: attaching a
  domain needs zone permissions the brokered `workers-deploy` token does not
  carry.
- **Refresh the record**: re-run `--phase 02-docs`; it is idempotent, and
  re-probes the page and the transcription socket on each environment.

## 4. Testing this baseline

`.github/workflows/baseline.yml` runs three tiers on every pull request, and
each runs locally the same way:

```bash
for t in manifest phases coverage rebrand retouch bootstrap-defer render; do bash testing/$t.test.sh; done
bash testing/leak.test.sh        # needs orun
bash testing/placement.test.sh   # needs orun ≥ the floor (and so ≥ ci.yml's pin), node, pnpm: the offline bootstrap
bash testing/e2e.test.sh         # + network for pnpm: each landing type-checked, linted, tested and built; the app dry-deployed and served, a recording captioned over the socket by an in-process Nova-3 (and the page in headless Chrome, on Linux), then a Deepgram token minted with a key
```

The offline bootstrap (`testing/lib/bootstrap.sh`) places both phases in
order and finishes each with the blueprint's OWN `run:` hooks — read out of
`repo-blueprint.yaml`, not transcribed — so the retouch marker, the rebrand,
the re-tenant, the work-tree strip, the deferrals and their restore and the
deployment record all run exactly as a real bootstrap runs them. Only the
platform's typed actions (task, repo, link, reconcile, land, watch, probe)
are stood in for, a landing becoming a commit on top of orun's `Initial
commit`.

The bootstrap's landings check their commit in the box (`orun validate` and
`orun plan`) and the app's pull requests build and dry-deploy it; neither
lints or runs the tests. The e2e tier is where those run, on each landing,
before a tag is cut.

## 5. Cutting a baseline tag (maintainers)

Every app built from this repository resolves a `baseline-vN` tag, so the
tag is cut by a workflow rather than by hand:

```bash
gh workflow run tag.yml -f version=baseline-v1          # from main
gh workflow run tag.yml -f version=baseline-v1 -f ref=<sha>
```

It refuses a version that is not `baseline-v<N>` and a tag that already
exists: a baseline tag is never moved. Then add (or move) the registry row in
orun-cloud's `infra/baselines-registry/baselines.yaml` by pull request —
after the tag exists, because the registry's sync fetches `blueprint.yaml`
at the tag and refuses the whole catalogue if it 404s.

## Troubleshooting

| Symptom | Cause → fix |
|---|---|
| `01-product` parks: `waiting for github for <org>` | the workspace's GitHub connection is to another account. Connect the App installation on `<org>` (console → Integrations → GitHub), then `--resume` |
| `01-product` waits on the `providers` probe for cloudflare, then stops | Cloudflare is not connected. Connect it (console → Integrations), then re-run the phase — the probe is a wait, not a failure |
| `01-product` stops at `link` | the repository is not linked to the workspace and the credential cannot link it. Allow-list it (console → Settings → Git repos) and re-run the phase |
| Secret WRITE fails `not_found` while listings work | the API key's role is below admin; re-mint it with the admin role |
| Deploy lane: Authentication error (10000) | the connection's token lacks Workers Scripts Write; re-issue it, re-connect, re-run `01-product` |
| Deploy lane's build: `Symlink … points out of the filesystem root` | the composition links one lane-wide install into the job's tree (stack-tectonic ≥ 0.20.0), which Next 16's Turbopack refuses. The app pins 0.19.0 for this; keep the pin |
| The page never captions, and the caption says nothing is connected | the token route answered 503: this is `next dev` with no Deepgram key (no Cloudflare context, no `/api/listen`), or the Worker lost its `AI` binding (`wrangler.jsonc`'s `"ai": { "binding": "AI" }` block) |
| The page asks for no microphone | the page is not on a secure origin (the microphone needs HTTPS or localhost), or the browser's permission for the site is denied |
| The caption says Deepgram refused the key | the stored `DEEPGRAM_API_KEY` is of too low a scope to mint tokens (needs Member or higher), or revoked: replace it and redeploy, or delete it to go back to Workers AI |
| The socket closes at once on Workers AI | the account's Workers AI daily allowance is spent (Free), or Nova-3's real-time mode refused the session: `wrangler tail <reponame>-web-<env>` shows the Worker's side; risk LT-B |
| `land` stops: `the landing's own check failed — orun plan for …` | the app's tree does not plan — the line after it is orun's own error (an unknown component type, a composition that does not resolve). Nothing was pushed. Fix the tree (or the baseline) and re-run the phase |
| `land` waits on CI after all | the app's repository requires a status check on `main` (branch protection or a ruleset), so GitHub refused the early merge; the landing waits for the check as a `checks: ci` landing would, then merges |
| Convergence failed AFTER the PR merged; re-running lands nothing | expected on its own — the files are on main. Re-run the phase (`--phase 01-product`, `--redo 01-product`, or the console's Retry): its `retouch` hook gives the landing a diff and the app redeploys |
| The app's `intent.yaml` says `workspace: ws_SET_ME` | `orunWorkspace` was empty and the build ran outside a workspace; set it and re-run `01-product` |
| A bootstrap stopped before `02-docs`; prod no longer waits on stage | the gate is deferred, not dropped: run `02-docs`, or `node tooling/bootstrap/promotion.mjs --restore --file <app>/intent.yaml` |
| `✕ input "productname" is required` | all three required inputs (`reponame`, `productname`, `githuborg`) must be set on every invocation, single-phase ones included |
| `unknown flag: --phase`, `has no parameter "checks"`, `has no parameter "secrets"` or another parse error in the blueprint | the CLI is below the v2.88.0 floor |
| the convergence reported green, then `verify` got 404 from both URLs | a second workflow ran on the push to main and the watch took its run. Only `ci.yml` runs on a push to main (`testing/coverage.test.sh` holds it); read the CI run on main for the real result |
| the convergence planned no lanes at all | the merge's push had no `before` to diff against (a first push straight onto an unborn `main`). The landing merges a pull request into orun's `Initial commit`, so its push has one; re-run the phase and its retouch marker re-plans the app |
