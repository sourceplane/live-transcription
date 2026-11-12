// The browser's side of live transcription on Workers AI: the page's socket
// to /api/listen (lib/listen.ts), which the Worker opens straight onto
// Deepgram's Nova-3 through its AI binding. It speaks to the page as
// Deepgram's own LiveClient does — the `open`, `close` and `Results` events
// (LiveTranscriptionEvents' values), `send`, `keepAlive` and `finish` — so
// upstream's caption code reads it unchanged. What differs is the audio:
// Nova-3 here takes linear16 PCM, so an AudioWorklet
// (public/pcm-capture.worklet.js) taps the microphone's stream and sends it,
// while the MediaRecorder's WebM chunks the caption code passes to `send`
// are dropped.

type Listener = (...args: any[]) => void;

export const LISTEN_PATH = "/api/listen";
export const WORKLET_URL = "/pcm-capture.worklet.js";

export function listenUrl(pageUrl: string, sampleRate: number, path = LISTEN_PATH): string {
  const url = new URL(path, pageUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("sample_rate", String(Math.round(sampleRate)));
  return url.toString();
}

export class WorkersAiLiveClient {
  readonly kind = "workers-ai";
  private listeners = new Map<string, Set<Listener>>();
  private closed = false;

  private constructor(
    private readonly socket: WebSocket,
    private readonly context: AudioContext,
    private readonly stream: MediaStream,
  ) {
    socket.binaryType = "arraybuffer";
    socket.addEventListener("open", () => {
      this.startAudio().catch((error) => this.emit("error", error));
      this.emit("open");
    });
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let data: { type?: string } | null = null;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data && typeof data.type === "string") this.emit(data.type, data);
    });
    socket.addEventListener("close", (event) => {
      this.stopAudio();
      this.emit("close", event);
    });
    socket.addEventListener("error", (event) => this.emit("error", event));
  }

  // Opens the socket at the context's own sample rate; the audio starts once
  // the socket is open.
  static async connect(stream: MediaStream, pageUrl = window.location.href): Promise<WorkersAiLiveClient> {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    await context.audioWorklet.addModule(WORKLET_URL);
    const socket = new WebSocket(listenUrl(pageUrl, context.sampleRate));
    return new WorkersAiLiveClient(socket, context, stream);
  }

  addListener(event: string, listener: Listener): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  removeListener(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  private emit(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  // PCM goes out from the worklet; the MediaRecorder's WebM chunks are not
  // what this socket takes.
  send(data: unknown): void {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) this.socket.send(data as ArrayBuffer);
  }

  // The worklet streams silence too, so the socket never idles.
  keepAlive(): void {}

  finish(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopAudio();
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close(1000, "finished");
    }
  }

  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;

  private async startAudio() {
    if (this.node || this.closed) return;
    this.source = this.context.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.context, "pcm-capture");
    // A silent sink keeps the graph pulling the worklet.
    this.sink = this.context.createGain();
    this.sink.gain.value = 0;
    this.node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (this.socket.readyState === WebSocket.OPEN) this.socket.send(event.data);
    };
    this.source.connect(this.node);
    this.node.connect(this.sink);
    this.sink.connect(this.context.destination);
    if (this.context.state === "suspended") await this.context.resume();
  }

  private stopAudio() {
    this.source?.disconnect();
    this.node?.disconnect();
    this.sink?.disconnect();
    if (this.node) this.node.port.onmessage = null;
    this.source = this.node = this.sink = null;
    if (this.context.state !== "closed") this.context.close().catch(() => {});
  }
}
