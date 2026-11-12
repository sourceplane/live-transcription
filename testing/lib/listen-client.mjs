// The e2e's socket client: opens the live-transcription socket (/api/listen)
// as the page does — ws(s)://<site>/api/listen?sample_rate=<rate> — streams a
// 16-bit mono WAV's samples to it in 100 ms chunks of linear16 PCM, then
// prints every message it got back as one JSON document. Node 22's global
// WebSocket; no packages.
//
//   node listen-client.mjs <base-url> <file.wav> [settle-ms]
import { readFileSync } from "node:fs";

const [base, file, settleArg] = process.argv.slice(2);
const settle = Number(settleArg ?? 1500);
const wav = readFileSync(file);
// RIFF: find the fmt and data chunks.
let rate = 0;
let data = null;
for (let i = 12; i + 8 <= wav.length; ) {
  const id = wav.toString("ascii", i, i + 4);
  const size = wav.readUInt32LE(i + 4);
  if (id === "fmt ") rate = wav.readUInt32LE(i + 12);
  if (id === "data") data = wav.subarray(i + 8, i + 8 + size);
  i += 8 + size + (size % 2);
}
if (!rate || !data) throw new Error(`${file}: not a PCM WAV`);

const url = new URL("/api/listen", base);
url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
url.searchParams.set("sample_rate", String(rate));
const socket = new WebSocket(url);
socket.binaryType = "arraybuffer";
const messages = [];
const out = { url: url.toString(), rate, bytes: data.length, opened: false, closed: null, messages };
const done = () => {
  process.stdout.write(JSON.stringify(out) + "\n");
  process.exit(0);
};
socket.addEventListener("message", (event) => {
  if (typeof event.data === "string") messages.push(JSON.parse(event.data));
});
socket.addEventListener("close", (event) => {
  out.closed = event.code;
});
socket.addEventListener("error", () => {
  out.error = true;
  done();
});
socket.addEventListener("open", async () => {
  out.opened = true;
  const step = Math.round(rate / 10) * 2;
  for (let i = 0; i < data.length; i += step) {
    socket.send(data.subarray(i, i + step));
    await new Promise((r) => setTimeout(r, 10));
  }
  await new Promise((r) => setTimeout(r, settle));
  socket.close(1000, "done");
  await new Promise((r) => setTimeout(r, 200));
  done();
});
setTimeout(() => {
  out.timeout = true;
  done();
}, 30000);
