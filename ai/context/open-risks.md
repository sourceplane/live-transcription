# live-transcription — open risks

What is not yet proven or not yet decided. The full write-up of every risk,
including the accepted ones, is
`specs/epics/live-transcription/risks-and-open-questions.md`; this page lists only
what is still live, so it should be short.

| ID | Risk | State | What closes it |
|---|---|---|---|
| LT-A | Not proven live: repository creation, the brokered token, a real deploy bound to Workers AI, the secret push and the probes | OPEN | One bootstrap from a tag against a workspace |
| LT-B | No real model has heard speech: the socket, the audio format and the transcript events are proven against an in-process stand-in in Nova-3's shape (Cloudflare's own client's), and the token route against one of Deepgram's grant. Whether Workers AI's Nova-3 socket answers a browser's linear16 at 44.1/48 kHz as the stand-in does is unproven | OPEN | Speak to a deployment on Workers AI, and once with a Deepgram key |
| LT-C | Workers AI's socket may close a session that goes quiet: the page streams silence too, and sends no KeepAlive (undocumented there) | WATCH | A deployment left open with the microphone muted |

Accepted, and worth knowing before you change them: LT-D (setting a secret
redeploys nothing), LT-E (the page has no sign-in: anyone on this site's own
page transcribes, billed to the account or the key), LT-F (the template ships
the ABC Favorit font files with no licence of their own), LT-H (the
socket's origin check stops other sites' pages, not scripts).
