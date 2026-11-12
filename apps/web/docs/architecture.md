# web — architecture

Built by the turbo pipeline from `apps/web` and deployed with wrangler.

|                     |                                                 |
| ------------------- | ----------------------------------------------- |
| Worker config       | `apps/web/wrangler.jsonc`                       |
| Entry               | `worker.ts`                                     |
| Compatibility date  | `2026-10-01`                                    |
| Compatibility flags | `nodejs_compat`, `global_fetch_strictly_public` |

## Bindings

| Binding  | Kind          | Source                                  |
| -------- | ------------- | --------------------------------------- |
| `AI`     | Workers AI    | account-level; no resource to provision |
| `ASSETS` | Static assets | `.open-next/assets`                     |

## Secrets resolved by the lane (names only)

- `DEEPGRAM_API_KEY` (optional)
