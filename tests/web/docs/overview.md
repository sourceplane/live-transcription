# web-tests

The app's vitest suite (the transcription socket and the token route against Workers AI and Deepgram stand-ins, the browser's socket client and its PCM worklet, the template's caption handling in jsdom, and the site's identity), run with pnpm test

The test suite for **web**. It deploys nothing: its lane installs, builds and runs the tests.

|              |                      |
| ------------ | -------------------- |
| Type         | `turbo-package`      |
| Source       | `tests/web`          |
| Package      | `@app/web-tests`     |
| Environments | `dev`: `quick-check` |

## Depends on

- (none)

## Depended on by

- (none)
