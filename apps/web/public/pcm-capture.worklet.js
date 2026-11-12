// The microphone's audio as linear16 PCM for Workers AI's Nova-3: channel 0
// of the stream, at the AudioContext's own rate (the page tells the socket
// that rate), posted to the page in 100 ms chunks of 16-bit little-endian
// samples. Silence is sent too: a steady stream keeps the socket open.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    // `sampleRate` is the AudioWorkletGlobalScope's: the context's own rate.
    this.frames = Math.max(128, Math.round(sampleRate / 10));
    this.chunk = new Int16Array(this.frames);
    this.length = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      this.chunk[this.length++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.length === this.frames) {
        this.port.postMessage(this.chunk.buffer, [this.chunk.buffer]);
        this.chunk = new Int16Array(this.frames);
        this.length = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCapture);
