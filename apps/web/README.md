# Next.js Live Transcription, on Workers

Speak, and the page captions you live, from Vercel's
[Next.js Live Transcription](https://github.com/deepgram-starters/nextjs-live-transcription)
(deepgram-starters/nextjs-live-transcription, MIT), running on Cloudflare
Workers + Static Assets:

- The page (`app/page.tsx`, `app/components/App.tsx`) asks for the microphone,
  draws its spectrum (`Visualizer.tsx`) and shows each transcript as its
  caption — interim ones as they grow, the final one until 3 seconds after you
  stop — as the template does
- `/api/authenticate` (`app/api/authenticate/route.ts`) tells the page which
  service transcribes: with no key, Workers AI; with the owner's optional
  `DEEPGRAM_API_KEY`, a short-lived Deepgram token minted with it, as upstream
- `/api/listen` is the Worker's own (`worker.ts` → `lib/listen.ts`, before
  Next.js): it opens Deepgram's Nova-3 on Workers AI over a WebSocket through
  the Worker's `AI` binding and hands that socket to the page, which streams
  linear16 PCM from an AudioWorklet (`public/pcm-capture.worklet.js`,
  `lib/workers-ai-live.ts`) and reads Deepgram's own `Results` back — no key
- The template's CORS middleware (`middleware.ts`) still guards the token route

The site's name and source link are in `app/site.ts`.

```bash
pnpm dev        # next dev on http://localhost:3000 (no Workers AI: transcription needs .env.local's Deepgram key)
pnpm build      # next build + opennextjs-cloudflare build → .open-next/
pnpm preview    # wrangler dev over the built Worker (Workers AI needs `wrangler login`)
```

How it is deployed — per environment, on merge to `main` — and how the Deepgram
key is connected is the repository's README and `component.yaml` beside this
file.
