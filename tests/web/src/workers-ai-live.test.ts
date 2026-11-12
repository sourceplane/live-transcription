// @vitest-environment jsdom
//
// The browser's Workers AI client (lib/workers-ai-live.ts) against stand-ins
// for the Web Audio and WebSocket APIs: it opens /api/listen at the
// AudioContext's own rate, streams the worklet's PCM once the socket is open,
// drops the MediaRecorder's WebM chunks, and hands Deepgram's `Results` to the
// page under the event names upstream's caption code listens for.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveTranscriptionEvents } from "@deepgram/sdk";
import { WORKLET_URL, WorkersAiLiveClient, listenUrl } from "@/lib/workers-ai-live";

type SocketEvent = { data?: unknown; code?: number };

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static last: FakeSocket | null = null;
  readyState = FakeSocket.CONNECTING;
  binaryType = "blob";
  sent: unknown[] = [];
  closedWith: [number?, string?] | null = null;
  private handlers = new Map<string, ((event: SocketEvent) => void)[]>();
  constructor(readonly url: string) {
    FakeSocket.last = this;
  }
  addEventListener(type: string, fn: (event: SocketEvent) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  dispatch(type: string, event: SocketEvent = {}) {
    for (const fn of this.handlers.get(type) ?? []) fn(event);
  }
  send(data: unknown) {
    this.sent.push(data);
  }
  close(code?: number, reason?: string) {
    this.closedWith = [code, reason];
    this.readyState = FakeSocket.CLOSED;
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.dispatch("open");
  }
}

const graph: string[] = [];
const node = (name: string) => ({
  connect: (to: { name?: string }) => graph.push(`${name}->${to.name ?? "?"}`),
  disconnect: () => graph.push(`${name}-x`),
  name,
});

class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  sampleRate = 48000;
  state = "suspended";
  modules: string[] = [];
  destination = { name: "destination" };
  audioWorklet = { addModule: async (url: string) => void this.modules.push(url) };
  gain = { ...node("gain"), gain: { value: 1 } };
  constructor() {
    FakeAudioContext.last = this;
  }
  createMediaStreamSource() {
    return node("source");
  }
  createGain() {
    return this.gain;
  }
  async resume() {
    this.state = "running";
  }
  async close() {
    this.state = "closed";
  }
}

class FakeWorkletNode {
  static last: FakeWorkletNode | null = null;
  port: { onmessage: ((event: { data: ArrayBuffer }) => void) | null } = { onmessage: null };
  connect = node("worklet").connect;
  disconnect = node("worklet").disconnect;
  name = "worklet";
  constructor(readonly context: unknown, readonly processor: string) {
    FakeWorkletNode.last = this;
  }
}

beforeEach(() => {
  graph.length = 0;
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
});
afterEach(() => vi.unstubAllGlobals());

const stream = {} as MediaStream;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("listenUrl", () => {
  it("opens the socket on the page's own origin, wss for https, with the rate", () => {
    expect(listenUrl("https://live.example.workers.dev/some/page?x=1", 48000)).toBe("wss://live.example.workers.dev/api/listen?sample_rate=48000");
    expect(listenUrl("http://127.0.0.1:8787/", 44100.4)).toBe("ws://127.0.0.1:8787/api/listen?sample_rate=44100");
  });
});

describe("WorkersAiLiveClient", () => {
  it("loads the worklet and opens /api/listen at the context's rate", async () => {
    const client = await WorkersAiLiveClient.connect(stream, "https://live.example.workers.dev/");
    expect(client.kind).toBe("workers-ai");
    expect(FakeAudioContext.last!.modules).toEqual([WORKLET_URL]);
    expect(FakeSocket.last!.url).toBe("wss://live.example.workers.dev/api/listen?sample_rate=48000");
    expect(FakeSocket.last!.binaryType).toBe("arraybuffer");
  });

  it("streams the worklet's PCM once the socket is open, and only then", async () => {
    const client = await WorkersAiLiveClient.connect(stream, "https://live.example.workers.dev/");
    const opened = vi.fn();
    client.addListener(LiveTranscriptionEvents.Open, opened);
    const socket = FakeSocket.last!;
    expect(FakeWorkletNode.last).toBeNull();
    socket.open();
    await flush();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(FakeWorkletNode.last!.processor).toBe("pcm-capture");
    expect(graph).toEqual(["source->worklet", "worklet->gain", "gain->destination"]);
    expect(FakeAudioContext.last!.gain.gain.value).toBe(0);
    expect(FakeAudioContext.last!.state).toBe("running");
    const pcm = new Int16Array([1, -2, 3]).buffer;
    FakeWorkletNode.last!.port.onmessage!({ data: pcm });
    expect(socket.sent).toEqual([pcm]);
  });

  it("drops the MediaRecorder's WebM chunks but sends PCM it is given", async () => {
    const client = await WorkersAiLiveClient.connect(stream, "https://live.example.workers.dev/");
    const socket = FakeSocket.last!;
    client.send(new ArrayBuffer(4));
    expect(socket.sent).toHaveLength(0); // not open yet
    socket.open();
    client.send(new Blob(["webm"], { type: "audio/webm" }));
    client.send("text");
    const pcm = new Int16Array(4);
    client.send(pcm);
    expect(socket.sent).toEqual([pcm]);
  });

  it("hands Deepgram's Results to upstream's Transcript listener, and nothing else", async () => {
    const client = await WorkersAiLiveClient.connect(stream, "https://live.example.workers.dev/");
    const transcript = vi.fn();
    client.addListener(LiveTranscriptionEvents.Transcript, transcript);
    const socket = FakeSocket.last!;
    socket.open();
    const result = { type: "Results", is_final: true, speech_final: true, channel: { alternatives: [{ transcript: "Hello there." }] } };
    socket.dispatch("message", { data: JSON.stringify(result) });
    socket.dispatch("message", { data: "not json" });
    socket.dispatch("message", { data: new ArrayBuffer(2) });
    socket.dispatch("message", { data: JSON.stringify({ type: "Metadata" }) });
    expect(transcript).toHaveBeenCalledTimes(1);
    expect(transcript).toHaveBeenCalledWith(result);
    client.removeListener(LiveTranscriptionEvents.Transcript, transcript);
    socket.dispatch("message", { data: JSON.stringify(result) });
    expect(transcript).toHaveBeenCalledTimes(1);
  });

  it("finishes by closing the socket and the audio, once; keepAlive sends nothing", async () => {
    const client = await WorkersAiLiveClient.connect(stream, "https://live.example.workers.dev/");
    const closed = vi.fn();
    client.addListener(LiveTranscriptionEvents.Close, closed);
    const socket = FakeSocket.last!;
    socket.open();
    await flush();
    client.keepAlive();
    expect(socket.sent).toHaveLength(0);
    client.finish();
    client.finish();
    expect(socket.closedWith).toEqual([1000, "finished"]);
    await flush();
    expect(FakeAudioContext.last!.state).toBe("closed");
    socket.dispatch("close", { code: 1000 });
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
