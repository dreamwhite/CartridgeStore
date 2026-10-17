# Tranche 267 — Fastify configuration metrics limits

## Moduli separati

- `backend/src/config/env-metrics-limits.ts`
- `backend/src/config/env.ts`

## Motivazione SRP

I limiti del receiver metriche e delle esportazioni costituiscono un dominio
numerico indipendente dai flag di scrittura e dalla policy di isolamento del
database. Sono stati estratti in un resolver dedicato, lasciando le regole di
abilitazione nel loader principale.

## Contratti preservati

- Nessun endpoint, response shape, schema SQLite o contratto MetricsServer è
  stato modificato.
- Sono invariati variabili d'ambiente, default, ordine delle validazioni e i
  quattro campi metrici di `BackendConfig`.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

Restano da estrarre i limiti score, segreti e backup. Non vengono accorpati
perché hanno contratti e policy di persistenza differenti.

## Commit creato

- `refactor(fastify-config): extract metrics limits`

## Prossima tranche

Separare i limiti del receiver score mantenendo invariati rate limit, cap righe
e dimensione payload.
