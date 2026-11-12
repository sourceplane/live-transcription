// @vitest-environment jsdom
//
// The template's own caption handling (app/components/App.tsx), unchanged in
// behaviour, in a browser DOM: whichever service transcribes, the connection
// emits Deepgram's `Results`, and the page shows each interim transcript as
// it grows, keeps the final one, and clears it 3 s after the speaker stops.
// The microphone's chunks go to the connection (none of zero bytes). The
// contexts are stand-ins: the transcription connection and the microphone.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

type Listener = (...args: unknown[]) => void;
const connection = {
  listeners: new Map<string, Set<Listener>>(),
  addListener(event: string, fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return this;
  },
  removeListener(event: string, fn: Listener) {
    this.listeners.get(event)?.delete(fn);
    return this;
  },
  emit(event: string, data: unknown) {
    for (const fn of this.listeners.get(event) ?? []) fn(data);
  },
  send: vi.fn(),
  keepAlive: vi.fn(),
  finish: vi.fn(),
};
const microphone = Object.assign(new EventTarget(), { stream: {}, state: "inactive" });
const state = { notice: null as string | null };

vi.mock("@/app/context/DeepgramContextProvider", async () => {
  const sdk = await vi.importActual<typeof import("@deepgram/sdk")>("@deepgram/sdk");
  return {
    LiveConnectionState: sdk.LiveConnectionState,
    LiveTranscriptionEvents: sdk.LiveTranscriptionEvents,
    useDeepgram: () => ({
      connection,
      connectToDeepgram: vi.fn(),
      connectionState: sdk.LiveConnectionState.OPEN,
      notice: state.notice,
    }),
  };
});

vi.mock("@/app/context/MicrophoneContextProvider", async () => {
  const actual = await vi.importActual<typeof import("@/app/context/MicrophoneContextProvider")>("@/app/context/MicrophoneContextProvider");
  return {
    MicrophoneEvents: actual.MicrophoneEvents,
    MicrophoneState: actual.MicrophoneState,
    useMicrophone: () => ({
      setupMicrophone: vi.fn(),
      microphone,
      startMicrophone: vi.fn(),
      microphoneState: actual.MicrophoneState.Open,
    }),
  };
});

const { default: App } = await import("@/app/components/App");

const results = (transcript: string, final = false) => ({
  type: "Results",
  is_final: final,
  speech_final: final,
  channel: { alternatives: [{ transcript }] },
});
const caption = () => document.querySelector("span.p-8")?.textContent ?? null;

beforeEach(() => {
  vi.useFakeTimers();
  state.notice = null;
  connection.listeners.clear();
  connection.send.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  // The Visualizer draws the microphone's spectrum on a canvas.
  vi.stubGlobal("AudioContext", class {
    createAnalyser() {
      return { frequencyBinCount: 8, getByteFrequencyData: () => {} };
    }
    createMediaStreamSource() {
      return { connect: () => {} };
    }
  });
  vi.stubGlobal("requestAnimationFrame", () => 0);
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the caption", () => {
  it("grows with each interim transcript, keeps the final one, and clears it 3 s later", () => {
    render(<App />);
    expect(caption()).toBe("Powered by Deepgram");
    act(() => connection.emit("Results", results("Hello")));
    expect(caption()).toBe("Hello");
    act(() => connection.emit("Results", results("Hello from")));
    expect(caption()).toBe("Hello from");
    act(() => connection.emit("Results", results("")));
    expect(caption()).toBe("Hello from");
    act(() => connection.emit("Results", results("Hello from the test.", true)));
    expect(caption()).toBe("Hello from the test.");
    act(() => vi.advanceTimersByTime(2900));
    expect(caption()).toBe("Hello from the test.");
    act(() => vi.advanceTimersByTime(200));
    expect(caption()).toBeNull();
  });

  it("sends the microphone's chunks to the connection, never an empty one", () => {
    render(<App />);
    const chunk = new Blob(["audio"]);
    act(() => {
      microphone.dispatchEvent(Object.assign(new Event("dataavailable"), { data: chunk }));
      microphone.dispatchEvent(Object.assign(new Event("dataavailable"), { data: new Blob([]) }));
    });
    expect(connection.send).toHaveBeenCalledTimes(1);
    expect(connection.send).toHaveBeenCalledWith(chunk);
  });

  it("shows why nothing transcribes, when it cannot", () => {
    state.notice = "Live transcription is not connected.";
    render(<App />);
    expect(caption()).toBe("Live transcription is not connected.");
  });
});
