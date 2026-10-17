# Tranche 263 — Fastify configuration authentication limits

## Moduli separati

- `backend/src/config/env-auth-limits.ts`
- `backend/src/config/env.ts`

## Motivazione SRP

Le soglie di autenticazione sono state separate dalle policy di abilitazione
dei writer e dai controlli di sicurezza delle origin. Il nuovo resolver gestisce
durata sessione, re-authentication recente e rate limit delle richieste auth.

## Contratti preservati

- Nessun endpoint, response shape, schema SQLite o flusso di autenticazione è
  stato modificato.
- Sono invariati nomi delle variabili d'ambiente, default, cinque campi del
  contratto `BackendConfig` e la funzione `positiveInteger` utilizzata.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

Restano nel loader le policy auth writer, lifecycle e bootstrap, che dipendono
da modalità runtime e isolamento dei database e non sono state fuse con le
soglie numeriche.

## Commit creato

- `refactor(fastify-config): extract authentication limits`

## Prossima tranche

Valutare separatamente le soglie HTTP generali e di download/catalogo.
