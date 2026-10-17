# Tranche 269 — Fastify configuration secret limits

## Moduli separati

- `backend/src/config/env-secret-limits.ts`
- `backend/src/config/env.ts`

## Motivazione SRP

Il limite del secret store è stato isolato dal flag di cifratura e dal percorso
del key registry. Questi ultimi restano nel loader perché fanno parte della
policy di sicurezza e dipendono dai profili runtime.

## Contratti preservati

- Nessun endpoint, response shape, schema SQLite o contratto di sicurezza è
  stato modificato.
- Sono invariati variabile d'ambiente, default, validazione e campo
  `secretMaxRows` di `BackendConfig`.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

Restano da separare i limiti backup e la validazione dei profili di cifratura;
non vengono accorpati perché hanno responsabilità di protezione e restore
distinte.

## Commit creato

- `refactor(fastify-config): extract secret limits`

## Prossima tranche

Separare i limiti degli archivi backup, preservando ordine di validazione,
compression ratio e messaggi di errore.
