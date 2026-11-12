// GET /api/authenticate, run as the Worker runs it (getCloudflareContext()
// answers with the Worker's env): which service transcribes, and with the
// owner's Deepgram key, the short-lived token upstream's grantToken mints.
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/authenticate/route";
import { clearCloudflareContext, fakeAI, setCloudflareContext, stubDeepgram } from "./fakes";

const request = () => new NextRequest("https://live.example.workers.dev/api/authenticate");

afterEach(() => {
  clearCloudflareContext();
  vi.unstubAllGlobals();
});

const noStore = (res: Response) => {
  expect(res.headers.get("cache-control")).toBe("s-maxage=0, no-store, no-cache, must-revalidate, proxy-revalidate");
  expect(res.headers.get("surrogate-control")).toBe("no-store");
  expect(res.headers.get("expires")).toBe("0");
};

describe("GET /api/authenticate", () => {
  it("names Workers AI when no Deepgram key is stored, and asks Deepgram nothing", async () => {
    const grants = stubDeepgram();
    setCloudflareContext({ AI: fakeAI().binding });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ provider: "workers-ai", url: "https://live.example.workers.dev/api/authenticate" });
    noStore(res);
    expect(grants).toHaveLength(0);
  });

  it("mints a short-lived Deepgram token with the owner's key, which never leaves the Worker", async () => {
    const grants = stubDeepgram();
    setCloudflareContext({ AI: fakeAI().binding, DEEPGRAM_API_KEY: "  dg-key-1234\n" });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ provider: "deepgram", access_token: "short-lived-token", expires_in: 30, url: "https://live.example.workers.dev/api/authenticate" });
    expect(JSON.stringify(body)).not.toContain("dg-key-1234");
    noStore(res);
    expect(grants).toEqual([{ url: "https://api.deepgram.com/v1/auth/grant", auth: "Token dg-key-1234" }]);
  });

  it("passes on Deepgram's refusal of a key of too low a scope", async () => {
    stubDeepgram();
    setCloudflareContext({ AI: fakeAI().binding, DEEPGRAM_API_KEY: "invalid-scope-key" });
    const res = await GET(request());
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ provider: "deepgram", error: "Deepgram refused the key: Insufficient permissions." });
  });

  it("says plainly that nothing transcribes outside a Worker with no key", async () => {
    stubDeepgram();
    vi.stubEnv("DEEPGRAM_API_KEY", "");
    const res = await GET(request());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ provider: "none", error: expect.stringContaining("not connected") });
    noStore(res);
    vi.unstubAllEnvs();
  });

  it("treats a blank key as no key", async () => {
    const grants = stubDeepgram();
    setCloudflareContext({ AI: fakeAI().binding, DEEPGRAM_API_KEY: "   " });
    expect(await (await GET(request())).json()).toMatchObject({ provider: "workers-ai" });
    expect(grants).toHaveLength(0);
  });
});
