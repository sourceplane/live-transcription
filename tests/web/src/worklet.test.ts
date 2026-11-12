// The AudioWorklet (public/pcm-capture.worklet.js), run in a VM with the
// AudioWorkletGlobalScope's names it uses: channel 0 becomes 16-bit
// little-endian PCM, clamped, posted in 100 ms chunks at the context's rate.
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";

const source = fs.readFileSync(path.resolve(__dirname, "../../../apps/web/public/pcm-capture.worklet.js"), "utf8");

function load(sampleRate: number) {
  const posted: { buffer: ArrayBuffer; transfer: unknown[] }[] = [];
  const registered: Record<string, new () => { process(inputs: Float32Array[][]): boolean }> = {};
  class AudioWorkletProcessor {
    port = { postMessage: (buffer: ArrayBuffer, transfer: unknown[]) => posted.push({ buffer, transfer }) };
  }
  vm.runInNewContext(source, {
    AudioWorkletProcessor,
    registerProcessor: (name: string, cls: new () => never) => (registered[name] = cls),
    sampleRate,
    Math,
    Int16Array,
  });
  const Processor = registered["pcm-capture"];
  if (!Processor) throw new Error("pcm-capture was not registered");
  return { processor: new Processor(), posted };
}

const block = (values: number[]) => Float32Array.from(values);

describe("pcm-capture", () => {
  it("registers itself and posts 100 ms of 16-bit samples at a time, transferring each buffer", () => {
    const { processor, posted } = load(16000);
    for (let i = 0; i < 12; i++) expect(processor.process([[new Float32Array(128)]])).toBe(true);
    expect(posted).toHaveLength(0); // 1,536 of 1,600 frames
    processor.process([[new Float32Array(128)]]);
    expect(posted).toHaveLength(1);
    expect(new Int16Array(posted[0]!.buffer)).toHaveLength(1600);
    expect(posted[0]!.transfer).toEqual([posted[0]!.buffer]);
  });

  it("converts and clamps samples as linear16", () => {
    const { processor, posted } = load(1280); // 128 frames to a chunk
    processor.process([[block([0, 0.5, -0.5, 1, -1, 1.5, -1.5, ...new Array(121).fill(0)])]]);
    expect(Array.from(new Int16Array(posted[0]!.buffer).slice(0, 7))).toEqual([0, 16383, -16384, 32767, -32768, 32767, -32768]);
  });

  it("reads channel 0 and keeps running with no input", () => {
    const { processor, posted } = load(16000);
    expect(processor.process([])).toBe(true);
    expect(processor.process([[]])).toBe(true);
    expect(posted).toHaveLength(0);
  });

  it("chunks at the context's own rate", () => {
    const { processor, posted } = load(48000);
    for (let i = 0; i < Math.ceil(4800 / 128); i++) processor.process([[new Float32Array(128)]]);
    expect(new Int16Array(posted[0]!.buffer)).toHaveLength(4800);
  });
});
