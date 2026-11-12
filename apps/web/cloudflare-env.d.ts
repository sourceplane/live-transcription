// The bindings wrangler.jsonc declares and the Worker secret the deploy
// pushes, as the Worker sees them. Declared by hand: a global
// @cloudflare/workers-types would retype Request and Response app-wide.
interface AiBinding {
  // With `{ websocket: true }`, a Response whose `webSocket` is the model's
  // socket (Nova-3's real-time transcription).
  run(model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}
interface CloudflareEnv {
  ASSETS: { fetch(input: Request | string | URL, init?: RequestInit): Promise<Response> };
  AI: AiBinding;
  // Optional: live transcription runs on Workers AI without it.
  DEEPGRAM_API_KEY?: string;
}
