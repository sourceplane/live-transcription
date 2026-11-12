// The live-transcription socket (lib/listen.ts): what worker.ts answers at
// /api/listen before any request reaches Next.js. The Workers AI binding is
// fakes.ts's: it answers run(model, params, { websocket: true }) with a
// Response carrying a socket, and the handler must hand that Response back as
// it is — the browser's 101 — with the template's own live options.
import { describe, expect, it } from "vitest";
import { MAX_SAMPLE_RATE, MIN_SAMPLE_RATE, NOVA_3, handleListen, listenParams } from "@/lib/listen";
import { fakeAI, upgrade } from "./fakes";

const SITE = "https://live.example.workers.dev";
const at = (query: string) => `${SITE}/api/listen${query}`;

describe("listenParams", () => {
  it("takes the page's sample rate and upstream's live options, as strings", () => {
    expect(listenParams(new URL(at("?sample_rate=48000")))).toEqual({
      encoding: "linear16",
      sample_rate: "48000",
      interim_results: "true",
      smart_format: "true",
      filler_words: "true",
      utterance_end_ms: "3000",
    });
  });

  it("refuses a rate a browser does not run at", () => {
    for (const q of ["", "?sample_rate=", "?sample_rate=abc", "?sample_rate=44100.5", "?sample_rate=7999", "?sample_rate=48001", "?sample_rate=96000", "?sample_rate=-16000"]) {
      expect(listenParams(new URL(at(q))), q).toBeNull();
    }
    expect(listenParams(new URL(at(`?sample_rate=${MIN_SAMPLE_RATE}`)))?.sample_rate).toBe("8000");
    expect(listenParams(new URL(at(`?sample_rate=${MAX_SAMPLE_RATE}`)))?.sample_rate).toBe("48000");
  });
});

describe("handleListen", () => {
  it("opens Nova-3 through the binding and hands its socket to the browser", async () => {
    const ai = fakeAI();
    const res = (await handleListen(upgrade(at("?sample_rate=44100"), { origin: SITE }), { AI: ai.binding })) as Response & { webSocket?: unknown };
    expect(res.webSocket).toBe(ai.socket);
    expect(ai.calls).toEqual([
      {
        model: NOVA_3,
        params: listenParams(new URL(at("?sample_rate=44100"))),
        options: { websocket: true },
      },
    ]);
  });

  it("serves a client that names no origin (not a browser)", async () => {
    const ai = fakeAI();
    const res = (await handleListen(upgrade(at("?sample_rate=16000")), { AI: ai.binding })) as Response & { webSocket?: unknown };
    expect(res.webSocket).toBe(ai.socket);
  });

  it("refuses before asking the model: a plain request, another site's page, a bad rate, a POST", async () => {
    const ai = fakeAI();
    const plain = await handleListen(new Request(at("?sample_rate=16000")), { AI: ai.binding });
    expect(plain.status).toBe(426);
    const elsewhere = await handleListen(upgrade(at("?sample_rate=16000"), { origin: "https://evil.example" }), { AI: ai.binding });
    expect(elsewhere.status).toBe(403);
    const garbled = await handleListen(upgrade(at("?sample_rate=16000"), { origin: "not a url" }), { AI: ai.binding });
    expect(garbled.status).toBe(403);
    const rate = await handleListen(upgrade(at("?sample_rate=96000"), { origin: SITE }), { AI: ai.binding });
    expect(rate.status).toBe(400);
    expect(await rate.json()).toEqual({ error: expect.stringContaining("sample_rate") });
    const post = await handleListen(upgrade(at("?sample_rate=16000"), { origin: SITE }, "POST"), { AI: ai.binding });
    expect(post.status).toBe(405);
    expect(ai.calls).toHaveLength(0);
    expect(plain.headers.get("cache-control")).toBe("no-store");
  });

  it("says so when Workers AI is not bound, or answers without a socket", async () => {
    const unbound = await handleListen(upgrade(at("?sample_rate=16000")), {});
    expect(unbound.status).toBe(503);
    const noSocket = await handleListen(upgrade(at("?sample_rate=16000")), { AI: fakeAI({ socket: false }).binding });
    expect(noSocket.status).toBe(502);
  });
});
