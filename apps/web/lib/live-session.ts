// What /api/authenticate answers the page: which service transcribes, and
// for Deepgram the short-lived token the browser opens Deepgram's socket with.
export type LiveSession =
  | { provider: "workers-ai"; url?: string }
  | { provider: "deepgram"; access_token: string; expires_in?: number; url?: string }
  | { provider: "deepgram"; error: string; url?: string }
  | { provider: "none"; error: string; url?: string };

export async function fetchLiveSession(path = "/api/authenticate"): Promise<LiveSession> {
  const response = await fetch(path, { cache: "no-store" });
  try {
    return (await response.json()) as LiveSession;
  } catch {
    return { provider: "none", error: `The transcription route answered ${response.status}.` };
  }
}

export function sessionError(session: LiveSession): string | null {
  return "error" in session ? session.error : null;
}
