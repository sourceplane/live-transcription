# web

The live-transcription page, its speech-to-text on Workers AI's Nova-3 over a WebSocket (Next.js on Cloudflare Workers + Static Assets via @opennextjs/cloudflare, behind its own Worker entry, with the Workers AI binding, per environment)

A Cloudflare Worker with Static Assets (server rendering plus static files), deployed per environment by its CI lane.

|              |                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| Type         | `cloudflare-workers-assets-turbo`                                                                                  |
| Source       | `apps/web`                                                                                                         |
| Package      | `@app/web`                                                                                                         |
| Environments | `dev`: `verify` · `stage`: `verify`, `deploy` on a push to `main` · `prod`: `verify`, `deploy` on a push to `main` |

## Depends on

- (none)

## Depended on by

- (none)
