// The Worker's entry: the live-transcription socket (lib/listen.ts) first —
// Next.js cannot answer a WebSocket upgrade — then every other request to the
// Worker @opennextjs/cloudflare builds into .open-next/.
import { LISTEN_PATH, handleListen } from "./lib/listen";
// @ts-ignore -- .open-next/worker.js is the build's output: absent until `pnpm build`, untyped after it.
import openNext from "./.open-next/worker.js";

type Handler = { fetch(request: Request, env: CloudflareEnv, ctx: unknown): Promise<Response> };

const worker: Handler = {
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname === LISTEN_PATH) return handleListen(request, env);
    return (openNext as Handler).fetch(request, env, ctx);
  },
};

export default worker;
