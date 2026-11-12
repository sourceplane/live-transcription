// The e2e's browser check: the page itself, in headless Chrome, transcribing
// what Chrome's fake microphone plays (a WAV, `--use-file-for-fake-audio-
// capture`). It loads the site, lets the page ask /api/authenticate, open its
// socket and stream the microphone through its AudioWorklet, and records every
// caption the page shows, then prints one JSON document:
//   { captions: [...distinct caption texts...], errors: [...], ws: [...] }
// Chrome DevTools Protocol over Node's global WebSocket; no packages.
//
//   node browser-caption.mjs <chrome> <page-url> <file.wav> [seconds]
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const [chrome, pageUrl, wav, secondsArg] = process.argv.slice(2);
const seconds = Number(secondsArg ?? 14);
const profile = mkdtempSync(join(tmpdir(), "lt-chrome-"));
const proc = spawn(
  chrome,
  [
    "--headless=new",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${wav}`,
    "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "ignore"], detached: true },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const finish = (out, code = 0) => {
  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {}
  setTimeout(() => {
    try {
      process.kill(-proc.pid, "SIGKILL");
    } catch {}
    rmSync(profile, { recursive: true, force: true });
    process.stdout.write(JSON.stringify(out) + "\n");
    process.exit(code);
  }, 500);
};

let port = "";
for (let i = 0; i < 100 && !port; i++) {
  const f = join(profile, "DevToolsActivePort");
  if (existsSync(f)) port = readFileSync(f, "utf8").split("\n")[0].trim();
  else await sleep(100);
}
if (!port) finish({ error: "Chrome did not start" }, 1);
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
const out = { captions: [], errors: [], ws: [], notice: null };
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === "Runtime.exceptionThrown") {
    out.errors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
  } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    out.errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
  } else if (msg.method === "Network.webSocketCreated") {
    out.ws.push(msg.params.url);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
await send("Runtime.enable");
await send("Network.enable");
await send("Page.enable");
await send("Page.navigate", { url: pageUrl });
// What the page's own environment says: a secure context (getUserMedia needs
// one) and whether a microphone opens at all.
await sleep(1500);
const probe = await send("Runtime.evaluate", {
  expression: `(async () => ({ secure: window.isSecureContext, media: !!navigator.mediaDevices, gum: await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => "ok " + s.getAudioTracks().map((t) => t.label).join(","), (e) => String(e)) }))()`,
  awaitPromise: true,
  returnByValue: true,
});
out.probe = probe.result?.result?.value ?? probe.result;
const caption = `(() => { const s = document.querySelector("main span.p-8"); return s ? s.textContent : null; })()`;
const deadline = Date.now() + seconds * 1000;
while (Date.now() < deadline) {
  const r = await send("Runtime.evaluate", { expression: caption, returnByValue: true });
  const text = r.result?.result?.value;
  if (text && out.captions[out.captions.length - 1] !== text) out.captions.push(text);
  await sleep(100);
}
finish(out);
