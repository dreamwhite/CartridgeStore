# Tranche 268 — Fastify configuration score limits

## Moduli separati

- `backend/src/config/env-scores-limits.ts`
- `backend/src/config/env.ts`

## Motivazione SRP

I limiti del receiver ScoreServer e della leaderboard sono stati separati in
un resolver dedicato: payload, rate limit, burst, client concorrenti e righe
massime appartengono allo stesso dominio operativo.

## Contratti preservati

- Nessun endpoint, response shape, schema SQLite o contratto ScoreServer è
  stato modificato.
- Sono invariati variabili d'ambiente, default, ordine delle validazioni e i
  sei campi score di `BackendConfig`.
- Restano separati i flag di scrittura e le verifiche di isolamento del writer.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

Restano da separare i limiti di segreti e backup; entrambi hanno policy di
protezione e persistenza distinte dai receiver telemetry e score.

## Commit creato

- `refactor(fastify-config): extract score limits`

## Prossima tranche

Analizzare i limiti del secret store e poi quelli degli archivi di backup,
mantenendo in `env.ts` le validazioni che dipendono dai profili runtime.
