# Tranche 266 — Fastify configuration submission limits

## Moduli separati

- `backend/src/config/env-submission-limits.ts`
- `backend/src/config/env.ts`

## Motivazione SRP

I limiti degli archivi di submission e il cap del review queue formano un
dominio unico di contenimento e gestione dei payload. Il resolver separa questa
responsabilità dalla configurazione dei writer, mantenendo la validazione del
flusso e delle autorizzazioni nel loader principale.

## Contratti preservati

- Nessun endpoint, response shape, schema SQLite, autenticazione o contratto
  firmware è stato modificato.
- Sono invariati variabili d'ambiente, default, ordine delle validazioni,
  messaggio del compression ratio e sette campi di `BackendConfig`.
- Sono invariati i limiti `positiveInteger` e il comportamento del valore
  numerico di `PRG32_BACKEND_SUBMISSION_MAX_COMPRESSION_RATIO`.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

Restano da valutare separatamente le soglie di metriche, score, segreti e
backup. Non sono state accorpate con submission perché hanno percorsi di
persistenza e policy di sicurezza distinti.

## Commit creato

- `refactor(fastify-config): extract submission limits`

## Prossima tranche

Analizzare le soglie metriche e score, preservando i rispettivi limiti di
payload, rate e righe senza modificare i receiver API.
