import { getCloudflareContext } from "@opennextjs/cloudflare";

export type LiveEnv = {
  AI?: CloudflareEnv["AI"];
  DEEPGRAM_API_KEY?: string;
};

// The Worker's bindings and secrets, read per request. Without a Cloudflare
// context (`next dev`, the tests) they are environment variables.
export function liveEnv(): LiveEnv {
  try {
    return getCloudflareContext().env as LiveEnv;
  } catch {
    return process.env as LiveEnv;
  }
}

// The owner's optional Deepgram API key (Member scope or higher), trimmed;
// undefined when it is not stored.
export function deepgramKey(env: LiveEnv): string | undefined {
  const key = env.DEEPGRAM_API_KEY?.trim();
  return key ? key : undefined;
}
