# Tranche 264 — Fastify configuration HTTP limits

## Moduli separati

- `backend/src/config/env-http-limits.ts`
- `backend/src/config/env.ts`

## Motivazione SRP

Timeout HTTP, keep-alive e rate limit per catalogo/download condividono una
responsabilità operativa distinta dalle policy auth, multiplayer e storage.
Sono stati spostati in un resolver dedicato che conserva la composizione del
contratto finale nel loader principale.

## Contratti preservati

- Nessun endpoint, response shape, schema SQLite o autorizzazione è stato
  modificato.
- Sono invariati variabili d'ambiente, default, sei campi HTTP di
  `BackendConfig` e le regole `positiveInteger`.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

Le soglie SAML, submission, metriche, score e backup restano nella
composizione di `env.ts` e saranno valutate per dominio separato.

## Commit creato

- `refactor(fastify-config): extract HTTP limits`

## Prossima tranche

Analizzare il blocco SAML e le soglie dei provider federati prima di procedere
con submission, metriche, score e backup.
