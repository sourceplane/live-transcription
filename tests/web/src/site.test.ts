// The site's identity (app/site.ts) and the Worker's configuration: what the
// deploy and the instantiation rely on.
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { SITE_NAME, SITE_URL, SOURCE_REPO, SOURCE_URL } from "@/app/site";
import type { NextConfig } from "next";

const web = path.resolve(__dirname, "../../../apps/web");
const read = (f: string) => fs.readFileSync(path.join(web, f), "utf8");
const { default: nextConfig } = (await import(path.join(web, "next.config.mjs"))) as { default: NextConfig };

describe("the site's identity", () => {
  it("is one literal line each, as the instantiation rewrites it", () => {
    const site = read("app/site.ts");
    expect(site).toMatch(/^export const SITE_NAME = "[^"\n]+";$/m);
    expect(site).toMatch(/^export const SOURCE_URL = "https:\/\/github\.com\/[^"\n]+";$/m);
    expect(site).toContain(`export const SITE_NAME = ${JSON.stringify(SITE_NAME)};`);
    expect(SOURCE_URL).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
    expect(`https://github.com/${SOURCE_REPO}`).toBe(SOURCE_URL);
  });

  it("serves from the environment's origin, localhost without one", () => {
    expect(SITE_URL).toBe((process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, ""));
  });

  it("titles the page with the site's name and shares the site's own origin", () => {
    expect(read("app/layout.tsx")).toMatch(/title: SITE_NAME,/);
    expect(read("app/layout.tsx")).toMatch(/metadataBase: new URL\(SITE_URL\)/);
    const page = read("app/page.tsx");
    expect(page).not.toContain("aura-tts-demo.deepgram.com");
    expect(page.match(/\$\{SHARE_URL\}/g)).toHaveLength(3);
    expect(page).toMatch(/href=\{SOURCE_URL\}/);
  });

  it("self-hosts Inter: next/font/google fails on GitHub's runners", () => {
    const layout = read("app/layout.tsx");
    expect(layout).not.toMatch(/from "next\/font\/google"/);
    expect(layout).toContain("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2");
  });
});

describe("the Worker", () => {
  const wrangler = JSON.parse(read("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, ""));

  it("binds Workers AI as AI, and the static assets as ASSETS", () => {
    expect(wrangler.ai).toEqual({ binding: "AI" });
    expect(wrangler.assets).toEqual({ directory: ".open-next/assets", binding: "ASSETS" });
    expect(wrangler.compatibility_flags).toContain("nodejs_compat");
  });

  it("enters through worker.ts, which answers the socket before Next.js", () => {
    expect(wrangler.main).toBe("worker.ts");
    const worker = read("worker.ts");
    expect(worker).toMatch(/import openNext from "\.\/\.open-next\/worker\.js";/);
    expect(worker).toMatch(/pathname === LISTEN_PATH\) return handleListen\(request, env\)/);
  });

  it("is built by OpenNext from a standalone Next.js build", () => {
    expect(nextConfig.output).toBe("standalone");
    expect(nextConfig.images?.unoptimized).toBe(true);
  });
});
