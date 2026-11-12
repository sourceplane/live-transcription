import { createClient } from "@deepgram/sdk";
import { NextResponse, type NextRequest } from "next/server";

import { deepgramKey, liveEnv } from "@/lib/env";
import type { LiveSession } from "@/lib/live-session";

export const revalidate = 0;
export const dynamic = "force-dynamic";

// The page asks this route how to transcribe, once per connection:
// - the owner stored a Deepgram key: a short-lived token minted with it
//   (upstream's grantToken), and the browser opens Deepgram's own socket;
// - no key, as every product starts: Workers AI, whose socket the Worker
//   opens at /api/listen through its own binding;
// - neither (the page outside a Worker, with no key): it says so.
// The key itself never leaves the Worker.
const noStore = (response: NextResponse) => {
  response.headers.set("Surrogate-Control", "no-store");
  response.headers.set("Cache-Control", "s-maxage=0, no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Expires", "0");
  return response;
};

const answer = (session: LiveSession, status = 200) => noStore(NextResponse.json(session, { status }));

// Deepgram's API errors arrive as their JSON body ({ err_msg, … }); the page
// shows the message itself.
function deepgramMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  try {
    const body = JSON.parse(message) as { err_msg?: unknown };
    if (typeof body.err_msg === "string" && body.err_msg) return `Deepgram refused the key: ${body.err_msg}`;
  } catch {}
  return message;
}

export async function GET(request: NextRequest) {
  // gotta use the request object to invalidate the cache every request :vomit:
  const url = request.url;
  const env = liveEnv();
  const key = deepgramKey(env);

  if (!key) {
    if (env.AI) return answer({ provider: "workers-ai", url });
    return answer(
      {
        provider: "none",
        error: "Live transcription is not connected: run the app as a Worker (Workers AI) or store a Deepgram API key.",
        url,
      },
      503,
    );
  }

  const deepgram = createClient(key);
  const { result: tokenResult, error: tokenError } = await deepgram.auth.grantToken();

  if (tokenError || !tokenResult?.access_token) {
    return answer(
      {
        provider: "deepgram",
        error: deepgramMessage(tokenError?.message) ?? "Failed to generate temporary token. Make sure your API key is of scope Member or higher.",
        url,
      },
      502,
    );
  }

  return answer({ provider: "deepgram", ...tokenResult, url });
}
