# Epics

Orun-style work programs. Each epic is a folder carrying `epic.yaml` (the
declaration the platform reads: slug, key prefix, milestones with exit
criteria and task keys) beside its doc set. The pull request that adds the
folder is the adoption; the merge creates the epic in the workspace.

| Epic | Cluster | Status | What it is |
|------|---------|--------|------------|
| [`live-transcription/`](./live-transcription/) | **LT** | In progress (LT0) | Vercel's Next.js Live Transcription on Cloudflare Workers + Static Assets through OpenNext, the microphone captioned live by Deepgram's Nova-3 on Workers AI over a WebSocket through the Worker's own binding with no key (Deepgram directly with the owner's optional key), and an Orun baseline that instantiates it in one landing (LT2) |

As-built ≠ intent: what shipped lives in each epic's `IMPLEMENTATION-STATUS.md`.
