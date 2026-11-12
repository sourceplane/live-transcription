#!/usr/bin/env bash
# TIER 2 — the live-transcription app a bootstrap produces builds, deploys
# (dry) and transcribes, first on Workers AI with no key (as every product
# starts), then minting a Deepgram token with its owner's optional key.
#
# placement.test.sh proves the tree a bootstrap ends with is the right tree.
# This proves it WORKS, by doing to it what its own pipelines will:
#
#   1. at the 01-product landing (the commit its one pull request merges), the
#      landing's own checks — install with the lockfile the product ships,
#      render fixtures and check the committed config is the render,
#      typecheck, lint, test, build. The bootstrap's landings are checked in
#      the box with `orun validate` and `orun plan` alone (`checks: local`;
#      their PR's CI on an `orun/BASE-…` branch is `plan` alone), and a
#      product's later pull requests build and dry-deploy it through ci.yml's
#      lanes, so THIS is where a product those steps refuse is caught: before
#      the tag, not after a build has merged it. Then the same at the 02-docs
#      landing, the finished app;
#   2. the stage lane's own steps, read out of `orun plan` in the product for
#      a pull request (the verify profile: the deploy profile has no dry run)
#      — EVERY `run:` step of the job, in order, exactly as planned: the
#      install, `verify-app-structure` (the committed `package.json` and
#      `wrangler.jsonc`, checked BEFORE any build), `build-app` (TypeGen,
#      `next build`, the OpenNext bundle, the static-assets cache copy, then
#      tooling/wire/worker-secrets.mjs), `verify-build-output` and
#      `deploy-dry-run` (`wrangler deploy --dry-run --name
#      <reponame>-web-stage`, which bundles worker.ts — the socket — over
#      the OpenNext build and must bind Workers AI as AI). They run IN THE TREE
#      THE RUNNER STAGES for the job (testing/lib/stage-job.py), with no build
#      output in it and the dependency layout the pinned composition produces.
#      The job's Deepgram key ref is optional; here the lane is given it, as an
#      owner who has stored one gives it, so this can prove the build never
#      sees it (`env -u`: the value is nowhere in .next or .open-next) and that
#      a verify lane, which holds no Cloudflare credential, pushes nothing;
#   3. serve the built Worker with `wrangler dev`, as a product with no key is
#      served: through the e2e's own entry (testing/lib/e2e-worker.mjs), which
#      answers the Worker's AI binding in-process — Workers AI has no local
#      mode — with nothing else changed. Run the component's OWN
#      `smokeCommand` against it, verbatim and then inside the deploy
#      profile's planned `smoke` step (its retry loop and all — only its
#      workers.dev URL swapped for the local one); then read what the app
#      promises: the page under the product's name and star button, its share
#      links on the stage origin, its worklet and assets; the token route
#      naming Workers AI, uncached, through upstream's CORS middleware; the
#      socket's refusals (426, 403, 400) before any model; and a speech-like
#      recording (testing/lib/speech-wav.py) streamed over the socket as the
#      page streams it, its interim and final captions back in Deepgram's
#      `Results`. Then, on Linux, the page itself in headless Chrome,
#      captioning what Chrome's fake microphone plays;
#   4. serve the SAME build with the owner's Deepgram key, as the deploy gives
#      it: the token route now mints a short-lived Deepgram token with it (the
#      entry answers Deepgram's grant in-process), and the key never reaches
#      the browser.
#
# What it cannot do is the platform's half: create the repository, mint the
# brokered Cloudflare token, deploy for real and probe workers.dev — nor ask a
# real model: whether Nova-3 (or Deepgram's own socket) hears speech well is
# only seen live. That is a bootstrap against a workspace (BOOTSTRAP.md);
# everything short of it is here.
#
# Needs: orun, node, pnpm, python3 (+PyYAML), git, curl, setsid, and the
# network for `pnpm install` (or a warm store); on Linux, headless Chrome.
# Several minutes: three installs and three Next.js builds.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
# shellcheck source=lib/bootstrap.sh
source "$here/lib/bootstrap.sh"

for bin in orun node pnpm python3 git curl setsid; do
  command -v "$bin" >/dev/null || { echo "e2e.test.sh needs $bin on PATH" >&2; exit 1; }
done

scratch="$(mktemp -d)"
dev_pid=""
# wrangler dev runs under pnpm, node and two workerd processes; a TERM to the
# first does not reach the rest, and waiting on it then never returns. So it is
# started as its own process group (setsid) and the whole group is stopped.
stop_group() { # PGID
  [ -n "$1" ] || return 0
  kill -TERM -- "-$1" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 -- "-$1" 2>/dev/null || break; sleep 0.5; done
  kill -KILL -- "-$1" 2>/dev/null || true
}
cleanup() {
  stop_group "$dev_pid"
  rm -rf "$scratch"
}
trap cleanup EXIT
values="$here/fixtures/acme.json"
repo="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['reponame'])" "$values")"
sub="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['subdomain'])" "$values")"
export CI=1 WRANGLER_SEND_METRICS=false NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1
# NO Deepgram key and NO Cloudflare credential, whatever the caller's shell
# holds: the lane below is given the key exactly as the e2e sets it, and a
# verify lane never holds a Cloudflare token.
unset DEEPGRAM_API_KEY CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
free_port() { python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()"; }

# The landing's own checks, step for step, run here at once on the whole
# tree. A pull request in the product builds and dry-deploys the app through
# ci.yml's lanes; the lint and the tests run here, and by hand before a push.
LANDING_CHECKS=(
  "pnpm install --frozen-lockfile"
  "pnpm run wire:fixture"
  "git diff --exit-code"
  "pnpm typecheck"
  "pnpm lint"
  "pnpm test"
  "pnpm build"
)
checks() { # DIR LOG
  local dir="$1" log="$2" cmd
  for cmd in "${LANDING_CHECKS[@]}"; do
    echo "   \$ $cmd" | tee -a "$log"
    if ! (cd "$dir" && bash -c "$cmd") >> "$log" 2>&1; then
      echo "FAIL: \`$cmd\` failed in $dir" >&2; tail -40 "$log" >&2; return 1
    fi
  done
}

echo "── the offline bootstrap (testing/lib/bootstrap.sh)"
tree="$scratch/$repo"
bootstrap_offline "$root" "$tree" "$values" "$scratch/logs" > "$scratch/bootstrap.log" 2>&1 || {
  echo "FAIL: the offline bootstrap stopped" >&2; tail -40 "$scratch/bootstrap.log" >&2; exit 1; }
s00="$(git -C "$tree" rev-parse HEAD~2)"; s01="$(git -C "$tree" rev-parse HEAD~1)"
echo "   2 phases placed and landed on orun's Initial commit"

# ── 1. each landing's own checks ───────────────────────────────────────────
echo "── 01-product's landing: install, the fixture render, typecheck, lint, test, build"
git -C "$tree" worktree add -q "$scratch/at-01" "$s01"
checks "$scratch/at-01" "$scratch/checks-01.log"
# Its tree is not needed again, and the disk is shared.
git -C "$tree" worktree remove --force "$scratch/at-01"

echo "── 02-docs's landing (the finished app): the same checks"
checks "$tree" "$scratch/checks-app.log"
# The template's Next.js line, which the deploy builds with (OpenNext 1.20.16
# takes Next.js 15 from 15.5.29).
grep -q 'Next.js 15\.5\.' "$scratch/checks-app.log" \
  || { echo "FAIL: the landing's build is not on the template's Next.js 15.5" >&2; grep -m3 'Next.js' "$scratch/checks-app.log" >&2; exit 1; }

# ── 2. the stage lane, as a pull request plans it ──────────────────────────
echo "── the stage lane: every run step the PR plan gives web@stage, in a staged job tree"
(cd "$tree" && orun plan --intent intent.yaml --trigger github-pull-request --changed \
   --base "$s00" --head "$s01" --env stage --output "$scratch/plan-pr.json") > "$scratch/plan-pr.log" 2>&1 \
  || { echo "FAIL: orun plan (pull request)" >&2; tail -15 "$scratch/plan-pr.log" >&2; exit 1; }
python3 - "$scratch/plan-pr.json" "$scratch/steps" "$tree" "$values" <<'PY'
import json, pathlib, sys
import yaml
plan = json.load(open(sys.argv[1]))
out = pathlib.Path(sys.argv[2]); out.mkdir()
tree, values = pathlib.Path(sys.argv[3]), json.load(open(sys.argv[4]))
repo, ws = values["reponame"], values["orunWorkspace"]
job = next(j for j in plan["jobs"] if j["component"] == "web" and j["environment"] == "stage")
params = yaml.safe_load((tree / "apps/web/component.yaml").read_text())["spec"]["parameters"]
order, uses = [], []
for s in job["steps"]:
    if "use" in s:
        uses.append(f"{s['id']}\t{s['use']}\t{json.dumps(s.get('with') or {})}")
        continue
    order.append(s["id"])
    (out / f"{s['id']}.sh").write_text(s.get("run") or "")
    (out / f"{s['id']}.wd").write_text(s.get("working-directory") or ".")
    if s.get("scope"):
        (out / f"{s['id']}.scope").write_text(s["scope"])
(out / "order").write_text("\n".join(order) + "\n")
(out / "uses").write_text("\n".join(uses) + "\n")
(out / "path").write_text(job.get("path") or "apps/web")
(out / "profile").write_text(job["profile"])
(out / "node").write_text(params["nodeVersion"])
(out / "pnpm").write_text(params["pnpmVersion"])
for k, v in (job.get("env") or {}).items():
    (out / "env").open("a").write(f"export {k}={json.dumps(v)}\n")
# What the platform resolves into the job before its first step. The Deepgram
# key's ref is OPTIONAL: on a product whose owner stored none, nothing is
# exported; on one that has, it is — which is what this lane replays.
refs = {r["asEnv"]: r for r in job.get("secretRefs") or []}
r = refs.get("DEEPGRAM_API_KEY")
if not r or r.get("optional") is not True or f"/{repo}/stage/" not in r.get("ref", ""):
    sys.exit(f"FAIL: the stage lane resolves DEEPGRAM_API_KEY as {r} — want an optional ref to the product's stage secret")
required = sorted(k for k, r in refs.items() if not r.get("optional"))
if required:
    sys.exit(f"FAIL: the verify lane requires secrets {required}; a pull request's lane needs none")
PY
order="$(tr '\n' ' ' < "$scratch/steps/order")"
echo "   $(cat "$scratch/steps/profile"): $order"
for need in install-workspace-dependencies verify-app-structure build-app verify-build-output deploy-dry-run; do
  grep -qx "$need" "$scratch/steps/order" || { echo "FAIL: the stage lane plans no $need step" >&2; exit 1; }
done
[ "$(grep -n -x verify-app-structure "$scratch/steps/order" | cut -d: -f1)" -lt "$(grep -n -x build-app "$scratch/steps/order" | cut -d: -f1)" ] \
  || { echo "FAIL: the structure check is planned after the build" >&2; exit 1; }
# The `use:` steps set up the runner's toolchain; here it is this machine's,
# so it must be the one the component asks for.
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" = "$(cat "$scratch/steps/node")" ] || { echo "FAIL: node $node_major here, the lane sets up $(cat "$scratch/steps/node")" >&2; exit 1; }
[ "$(pnpm --version)" = "$(cat "$scratch/steps/pnpm")" ] || { echo "FAIL: pnpm $(pnpm --version) here, the lane sets up $(cat "$scratch/steps/pnpm")" >&2; exit 1; }
echo "   setup-node $node_major and setup-pnpm $(pnpm --version) stand in for the lane's \`use:\` steps"
echo "   the Deepgram key's ref is optional: the lane runs with it set, as an owner's who stored one does"

# The job's private tree, staged as orun stages it, from a source checkout
# with no build output (a CI checkout has none, so step 1's is removed rather
# than copied in) and the dependencies the pinned composition says: a
# lane-scoped install ran once in the source tree (step 1 ran the same
# command) and is linked in, or the job installs its own.
rm -rf "$tree/apps/web/.next" "$tree/apps/web/.open-next" "$tree/apps/web/.wrangler" "$tree/tests/web/coverage"
work="$tree/.orun/runs/e2e/web.stage.verify-deploy/work"
install_scope="$(cat "$scratch/steps/install-workspace-dependencies.scope" 2>/dev/null || echo job)"
if [ "$install_scope" = lane ]; then
  python3 "$here/lib/stage-job.py" "$tree" "$work" --shared-deps
  [ -L "$work/node_modules" ] || { echo "FAIL: the staged tree's node_modules is not the lane's symlink" >&2; exit 1; }
else
  python3 "$here/lib/stage-job.py" "$tree" "$work"
  [ ! -e "$work/node_modules" ] || { echo "FAIL: the staged tree carries node_modules it should install" >&2; exit 1; }
fi
for built in apps/web/.next apps/web/.open-next apps/web/.wrangler; do
  [ ! -e "$work/$built" ] || { echo "FAIL: the staged tree carries build output ($built)" >&2; exit 1; }
done
echo "   staged: $(realpath --relative-to="$tree" "$work"); install scope: $install_scope; no build output"

# The key the platform would resolve for an owner who stored one: a value no
# file in the tree spells, so a match in the build output can only be a leak.
build_key="e2e-build-key-$(python3 -c 'import secrets;print(secrets.token_hex(12))')"
export DEEPGRAM_API_KEY="$build_key"
while IFS= read -r step; do
  [ -n "$step" ] || continue
  if [ "$step" = install-workspace-dependencies ] && [ "$install_scope" = lane ]; then
    echo "   · $step (lane-scoped: ran once in the source tree)"; continue
  fi
  echo "   ▸ $step"
  # The runner's per-job environment: the job's env (intent environment
  # `env:`) and ORUN_ENVIRONMENT; the step runs in the component's directory.
  if ! (cd "$work/$(cat "$scratch/steps/path")/$(cat "$scratch/steps/$step.wd")" && \
        { [ -f "$scratch/steps/env" ] && source "$scratch/steps/env"; true; } && \
        export ORUN_ENVIRONMENT=stage && bash -e "$scratch/steps/$step.sh") > "$scratch/$step.log" 2>&1; then
    echo "FAIL: the stage lane's $step step" >&2; tail -40 "$scratch/$step.log" >&2; exit 1
  fi
done < "$scratch/steps/order"
unset DEEPGRAM_API_KEY
[ "$install_scope" = lane ] || { [ -d "$work/node_modules" ] && [ ! -L "$work/node_modules" ]; } \
  || { echo "FAIL: the job's install did not land inside its own tree" >&2; exit 1; }
grep -q 'Next.js 15\.5\.' "$scratch/build-app.log" \
  || { echo "FAIL: the staged build is not on the template's Next.js 15.5" >&2; grep -m3 'Next.js' "$scratch/build-app.log" >&2; exit 1; }
grep -q 'populate: the static-assets incremental cache' "$scratch/build-app.log" \
  || { echo "FAIL: the build did not copy the pre-rendered pages into the static assets" >&2; exit 1; }
grep -q -- "--name \"\${EFFECTIVE_WORKER_NAME}\"" "$scratch/steps/deploy-dry-run.sh" && grep -q "$repo-web-stage" "$scratch/steps/deploy-dry-run.sh" \
  || { echo "FAIL: the dry run does not name the Worker $repo-web-stage" >&2; exit 1; }
grep -q 'Total Upload' "$scratch/deploy-dry-run.log" \
  || { echo "FAIL: the dry run bundled nothing" >&2; tail -20 "$scratch/deploy-dry-run.log" >&2; exit 1; }
grep -Eq 'env\.AI +AI' "$scratch/deploy-dry-run.log" \
  || { echo "FAIL: the dry run does not bind Workers AI as AI" >&2; tail -20 "$scratch/deploy-dry-run.log" >&2; exit 1; }
gz="$(grep -m1 -o 'gzip: [0-9.]* KiB' "$scratch/deploy-dry-run.log" | grep -o '[0-9.]*')"
python3 -c "import sys; sys.exit(0 if float(sys.argv[1]) <= 3072 else 1)" "${gz:-99999}" \
  || { echo "FAIL: the Worker is ${gz:-of unknown size} KiB gzipped — over Workers Free's 3 MiB" >&2; exit 1; }
echo "   the staged build ran on Next.js 15.5; the dry run bundled $repo-web-stage with Workers AI as AI ($(grep -m1 -o 'Total Upload: .*' "$scratch/deploy-dry-run.log"))"
if grep -rlF -e "$build_key" "$work/apps/web/.open-next" "$work/apps/web/.next" > "$scratch/leaked.txt" 2>/dev/null; then
  echo "FAIL: the Deepgram key is in the build output:" >&2; head -5 "$scratch/leaked.txt" >&2; exit 1
fi
grep -q "worker-secrets: no Cloudflare credential in this job (a verify lane) — DEEPGRAM_API_KEY reach $repo-web-stage from the deploy lane" "$scratch/build-app.log" \
  || { echo "FAIL: build-app did not hand the Deepgram key to worker-secrets.mjs (or pushed it from a verify lane)" >&2; grep -m3 'worker-secrets' "$scratch/build-app.log" >&2; exit 1; }
echo "   the build never saw the key; worker-secrets.mjs named it and pushed nothing from a verify lane"

# ── 3. serve it, and smoke it as the deploy does ───────────────────────────
# The Worker's config with ONE change, its `main`: the e2e's own entry, which
# imports the Worker's entry (worker.ts: the socket, then the OpenNext build)
# and hands it an in-process Workers AI. The `ai` block goes: Workers AI has
# no local mode, and wrangler would open a session to a Cloudflare account
# for it.
cp "$here/lib/e2e-worker.mjs" "$work/apps/web/e2e-worker.mjs"
python3 - "$work/apps/web/wrangler.jsonc" "$work/apps/web/wrangler.e2e.jsonc" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
text, n_main = re.subn(r'"main":\s*"worker\.ts"', '"main": "e2e-worker.mjs"', text)
text, n_ai = re.subn(r'\n\s*"ai":\s*\{\s*"binding":\s*"AI"\s*\},?', "", text)
if (n_main, n_ai) != (1, 1):
    sys.exit(f"FAIL: wrangler.jsonc has {n_main} main and {n_ai} ai block(s), want one of each")
open(sys.argv[2], "w").write(text)
PY
serve() { # LOG [--var K:V …]
  local log="$1"; shift
  port="$(free_port)"; iport="$(free_port)"
  # setsid without its own fork: the subshell is not a group leader, so the
  # pid recorded IS the new process group's.
  (cd "$work/apps/web" && exec setsid pnpm exec wrangler dev --config wrangler.e2e.jsonc --name "$repo-web-stage" "$@" \
     --ip 127.0.0.1 --port "$port" --inspector-port "$iport" --show-interactive-dev-session=false) \
     > "$log" 2>&1 < /dev/null &
  dev_pid=$!
  url="http://127.0.0.1:$port"
  for _ in $(seq 1 120); do
    curl -s -o /dev/null "$url/favicon.ico" && return 0
    kill -0 "$dev_pid" 2>/dev/null || { echo "FAIL: wrangler dev exited" >&2; tail -30 "$log" >&2; exit 1; }
    sleep 1
  done
  echo "FAIL: wrangler dev never answered" >&2; tail -30 "$log" >&2; exit 1
}

echo "── wrangler dev over the staged Worker, no Deepgram key: Workers AI"
serve "$scratch/dev.log"
smoke="$(python3 -c "import yaml,sys;print(yaml.safe_load(open(sys.argv[1]))['spec']['parameters']['smokeCommand'])" "$tree/apps/web/component.yaml")"
echo "   ▸ the component's own smokeCommand, verbatim, DEPLOYED_URL=$url"
DEPLOYED_URL="$url" bash -c "$smoke" || { echo "FAIL: the deploy's smoke refused the app" >&2; exit 1; }
if DEPLOYED_URL="$url/no-such-app" bash -c "$smoke" 2>/dev/null; then
  echo "FAIL: the smoke passed against a path that is not the app — it checks nothing" >&2; exit 1
fi
echo "   ▸ …and it refuses what is not the app"

(cd "$tree" && orun plan --intent intent.yaml --trigger github-push-main --changed \
   --base "$s00" --head "$s01" --env stage --output "$scratch/plan-push.json") > "$scratch/plan-push.log" 2>&1 \
  || { echo "FAIL: orun plan (push to main)" >&2; tail -15 "$scratch/plan-push.log" >&2; exit 1; }
python3 - "$scratch/plan-push.json" "$scratch/smoke-step.sh" "https://$repo-web-stage.$sub.workers.dev" <<'PY'
import json, sys
plan, out, origin = json.load(open(sys.argv[1])), sys.argv[2], sys.argv[3]
job = next(j for j in plan["jobs"] if j["component"] == "web" and j["environment"] == "stage")
assert job["profile"].endswith(".deploy"), job["profile"]
run = next(s for s in job["steps"] if s["id"] == "smoke")["run"]
# The one thing offline cannot reach is workers.dev: the step derives its URL
# from the Worker's name and the account's subdomain, so that line — and only
# that line — is pointed at the local Worker, after checking it is this app's.
line = 'export DEPLOYED_URL="https://${EFFECTIVE_WORKER_NAME}.${WORKERS_DEV_SUBDOMAIN}.workers.dev"'
if line not in run or 'EFFECTIVE_WORKER_NAME="' + origin.split("//")[1].split(".")[0] + '"' not in run:
    sys.exit(f"FAIL: the planned smoke step does not derive {origin}:\n{run}")
open(out, "w").write(run.replace(line, 'export DEPLOYED_URL="${E2E_LOCAL_URL}"'))
PY
echo "   ▸ the deploy profile's planned smoke step (its retry loop around the same command), on the local Worker"
(E2E_LOCAL_URL="$url" bash "$scratch/smoke-step.sh") > "$scratch/smoke-step.log" 2>&1 \
  || { echo "FAIL: the planned smoke step refused the app" >&2; tail -20 "$scratch/smoke-step.log" >&2; exit 1; }

# The app's checks, shared by both serves: PROVIDER is workers-ai or deepgram.
python3 "$here/lib/speech-wav.py" "$scratch/speech-16k.wav" 16000 > /dev/null
cat > "$scratch/live.py" <<'PY'
import html, http.client, json, re, subprocess, sys, urllib.error, urllib.request
base, values, origin, provider, libdir, wav = sys.argv[1], json.load(open(sys.argv[2])), sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6]
key = sys.argv[7] if len(sys.argv) > 7 else ""
name, repo, owner = values["productname"], values["reponame"], values["githuborg"]
# The stand-in's script (testing/lib/e2e-worker.mjs): one line per burst of
# sound in the recording.
SCRIPT = ["Hello from the live transcription test.",
          "The second burst of sound becomes the second line.",
          "And the third one ends the recording."]
NOVA = {"encoding": "linear16", "sample_rate": "16000", "interim_results": "true", "smart_format": "true",
        "filler_words": "true", "utterance_end_ms": "3000"}
problems = []
def bad(m): problems.append(m)
def get(path, headers=None):
    req = urllib.request.Request(base + path, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()
def upgrade(path, extra=None):
    host, port = base.split("//")[1].split(":")
    c = http.client.HTTPConnection(host, int(port), timeout=30)
    headers = {"Connection": "Upgrade", "Upgrade": "websocket", "Sec-WebSocket-Version": "13",
               "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ=="}
    headers.update(extra or {})
    c.request("GET", path, headers=headers)
    status = c.getresponse().status
    c.close()
    return status
calls = lambda: json.loads(get("/__e2e/calls")[2])

# The token route: which service transcribes, never cached, through
# upstream's CORS middleware.
s, h, body = get("/api/authenticate")
try:
    session = json.loads(body)
except ValueError:
    session = {}
if (h.get("cache-control") or "") != "s-maxage=0, no-store, no-cache, must-revalidate, proxy-revalidate" \
        or (h.get("surrogate-control") or "") != "no-store":
    bad(f"/api/authenticate is cacheable: {h.get('cache-control')!r}")
if h.get("access-control-allow-credentials") != "false":
    bad("/api/authenticate did not pass through upstream's CORS middleware")

if provider == "workers-ai":
    if s != 200 or session.get("provider") != "workers-ai" or "access_token" in session:
        bad(f"/api/authenticate answered {s} {session}, not Workers AI")

    # The page: the product's name and source, Deepgram's caption, no demo URL.
    s, h, body = get("/")
    page = body.decode().replace("<!-- -->", "")
    title = re.search(r"<title>(.*?)</title>", page, re.S)
    if s != 200 or not title or html.unescape(title.group(1)) != name:
        bad(f"/ answered {s} titled {title and html.unescape(title.group(1))!r}, not {name!r}")
    text = html.unescape(re.sub(r"<[^>]+>", " ", page))
    if "Powered by Deepgram" not in text or "Get an API Key" not in text:
        bad("the page does not show the template's caption, or its Get an API Key link")
    if f'aria-label="Star {owner}/{repo} on GitHub"' not in html.unescape(page):
        bad(f"the page's star button does not name {owner}/{repo}")
    scripts = re.findall(r'src="(/_next/static/[^"]+\.js)"', page)
    bundle = b""
    for src in scripts:
        s, h, js = get(src)
        if s != 200 or "javascript" not in (h.get("content-type") or ""):
            bad(f"{src} answered {s} {h.get('content-type')}")
        bundle += js
    if not scripts:
        bad("the page loads no /_next/static script")
    if origin.encode() not in bundle:
        bad(f"the page's share links are not on the stage origin {origin}")
    if b"aura-tts-demo.deepgram.com" in bundle + body or b"deepgram-starters/nextjs-live-transcription" in bundle:
        bad("the page still shares Deepgram's demo, or stars the template's repository")
    for path, ctype in (("/pcm-capture.worklet.js", "javascript"), ("/favicon.ico", ""), ("/deepgram.svg", "svg")):
        s, h, b = get(path)
        if s != 200 or ctype not in (h.get("content-type") or ""):
            bad(f"{path} answered {s} {h.get('content-type')}")
    s, _, worklet = get("/pcm-capture.worklet.js")
    if b'registerProcessor("pcm-capture"' not in worklet:
        bad("the AudioWorklet is not the page's PCM capture")
    s, _, _ = get("/no-such-page")
    if s != 404:
        bad(f"/no-such-page answered {s}, want 404")

    # The socket's refusals, before any model is opened.
    before = len([x for x in calls() if x["kind"] == "workers-ai.run"])
    s, _, _ = get("/api/listen?sample_rate=16000")
    if s != 426:
        bad(f"a plain request to the socket answered {s}, want 426")
    s = upgrade("/api/listen?sample_rate=16000", {"Origin": "https://evil.example"})
    if s != 403:
        bad(f"another site's page opening the socket answered {s}, want 403")
    s = upgrade("/api/listen?sample_rate=96000", {"Origin": base})
    if s != 400:
        bad(f"a 96 kHz socket answered {s}, want 400")
    if len([x for x in calls() if x["kind"] == "workers-ai.run"]) != before:
        bad("a refused socket still opened the model")

    # The socket, as the page opens it: the recording streamed as linear16,
    # its captions back from Nova-3's stand-in.
    out = subprocess.run(["node", f"{libdir}/listen-client.mjs", base, wav, "1500"], capture_output=True, text=True, timeout=60)
    try:
        got = json.loads(out.stdout)
    except ValueError:
        got = {}
        bad(f"the socket client failed: {out.stderr[-300:]}")
    msgs = got.get("messages", [])
    finals = [m["channel"]["alternatives"][0]["transcript"] for m in msgs if m.get("speech_final")]
    interim = [m["channel"]["alternatives"][0]["transcript"] for m in msgs if not m.get("is_final")]
    if not got.get("opened") or got.get("closed") != 1000:
        bad(f"the socket did not open and close cleanly: {got.get('opened')}, {got.get('closed')}")
    if finals != SCRIPT:
        bad(f"the socket's final captions are {finals}, not the recording's three lines")
    if len(interim) < 6 or not all(any(line.startswith(i) for line in SCRIPT) for i in interim):
        bad(f"the interim captions do not grow word by word: {interim[:6]}")
    runs = [x for x in calls() if x["kind"] == "workers-ai.run"]
    run = runs[-1] if runs else {}
    if run.get("model") != "@cf/deepgram/nova-3" or run.get("websocket") is not True or run.get("inputs") != NOVA:
        bad(f"the socket did not open Nova-3 in real-time mode with upstream's options: {run}")
    elif run["bytes"] != got.get("bytes") or run["oddChunks"] or run["finals"] != SCRIPT:
        bad(f"Nova-3's stand-in heard {run['bytes']} of {got.get('bytes')} bytes ({run['oddChunks']} odd chunks)")
    if any(x["kind"] == "deepgram" for x in calls()):
        bad("Deepgram was asked for a token with no key stored")
    summary = (f"   workers-ai: the page; the token route; the socket's refusals (426, 403, 400); {got.get('bytes')} bytes "
               f"of linear16 streamed, {len(interim)} interim captions and {len(finals)} final ones back from Nova-3")
else:
    if s != 200 or session.get("provider") != "deepgram" or session.get("access_token") != f"e2e-access-token-for-{key[-4:]}":
        bad(f"/api/authenticate answered {s} {session}, not a Deepgram token minted with the owner's key")
    if key in body.decode():
        bad("the owner's Deepgram key reached the browser")
    grants = [x for x in calls() if x["kind"] == "deepgram"]
    if [(g["method"], g["path"], g["auth"]) for g in grants] != [("POST", "/v1/auth/grant", f"Token {key}")]:
        bad(f"Deepgram's grant was asked {grants}, not once with the owner's key")
    if any(x["kind"] == "workers-ai.run" for x in calls()):
        bad("Workers AI was opened for a token")
    summary = "   deepgram: a short-lived token minted with the owner's key (never sent to the browser)"

if problems:
    for p in problems:
        print(f"  ✕ {p}", file=sys.stderr)
    sys.exit(1)
print(summary)
PY

echo "   ▸ the page, its assets, the token route and the socket, on Workers AI"
python3 "$scratch/live.py" "$url" "$values" "https://$repo-web-stage.$sub.workers.dev" workers-ai "$here/lib" "$scratch/speech-16k.wav" \
  || { echo "FAIL: the app on Workers AI" >&2; tail -20 "$scratch/dev.log" >&2; exit 1; }

# The page itself, in a real browser: Chrome's fake microphone plays the
# recording, and the page — its AudioWorklet, its socket, the template's
# caption code — must show what Nova-3's stand-in heard. Headless Chrome's
# fake capture works on Linux (GitHub's runners carry google-chrome); on
# macOS its getUserMedia never resolves, so there it cannot run, and says so.
chrome="${CHROME:-}"
if [ -z "$chrome" ]; then
  for c in google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$c" >/dev/null; then chrome="$(command -v "$c")"; break; fi
  done
fi
if [ -n "$chrome" ] && [ "$(uname)" != Darwin ]; then
  echo "   ▸ the page in headless Chrome, captioning what its fake microphone plays"
  node "$here/lib/browser-caption.mjs" "$chrome" "$url/" "$scratch/speech-16k.wav" 16 > "$scratch/browser.json" \
    || { echo "FAIL: headless Chrome did not run" >&2; cat "$scratch/browser.json" >&2; exit 1; }
  python3 "$here/lib/browser-check.py" "$scratch/browser.json" "$url" \
    || { echo "FAIL: the page in Chrome" >&2; tail -20 "$scratch/dev.log" >&2; exit 1; }
elif [ -n "${GITHUB_ACTIONS:-}" ]; then
  echo "FAIL: no headless Chrome on this runner for the page's own check" >&2; exit 1
else
  echo "   · the page in headless Chrome: not run here ($(uname); its fake microphone works on Linux, as on CI)"
fi

# ── 4. the same build, with the owner's Deepgram key ───────────────────────
echo "── the same build, with the owner's Deepgram key: a short-lived token"
stop_group "$dev_pid"; dev_pid=""
key="e2e-deepgram-key-$(python3 -c 'import secrets;print(secrets.token_hex(8))')"
serve "$scratch/dev-deepgram.log" --var "DEEPGRAM_API_KEY:$key"
echo "   ▸ the component's own smokeCommand, with the key"
DEPLOYED_URL="$url" bash -c "$smoke" || { echo "FAIL: the deploy's smoke refused the app with a Deepgram key" >&2; exit 1; }
echo "   ▸ the token route, minting from the owner's key"
python3 "$scratch/live.py" "$url" "$values" "https://$repo-web-stage.$sub.workers.dev" deepgram "$here/lib" "$scratch/speech-16k.wav" "$key" \
  || { echo "FAIL: the app with a Deepgram key" >&2; tail -20 "$scratch/dev-deepgram.log" >&2; exit 1; }

echo "e2e.test.sh: ok"
