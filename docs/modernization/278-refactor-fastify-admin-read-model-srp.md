# Tranche 278 — Fastify admin read model

## Moduli separati

- `backend/src/admin/read-model.ts`
- `backend/src/admin/service.ts`

## Motivazione SRP

Il servizio amministrativo conteneva query e mapping per lista utenti, gruppi,
ruoli e audit oltre alle mutazioni identitarie. Il read model è stato estratto
in un modulo dedicato; il servizio conserva transazioni, audit, revoche,
protezioni dell'ultimo amministratore e tutte le scritture.

## Contratti preservati

- Sono invariati filtri, escaping LIKE, paginazione, limiti, ordinamenti e
  proiezioni delle risposte amministrative.
- Sono invariati fallback per colonne account opzionali, parsing dell'audit e
  conteggi utenti/gruppi/ruoli.
- Non sono stati modificati endpoint, autorizzazioni, errori, schema SQLite o
  dati operativi.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

Le mutazioni utenti e gruppi restano nel servizio per mantenere atomici
database, revoche e audit. Non è stato introdotto un layer repository
generalizzato.

## Commit creato

- `refactor(fastify-admin): extract admin read model`

## Prossima tranche

Analizzare `setup/service.ts` per separare query/configurazione o adapter di
dominio senza spostare le transazioni di setup e migrazione.
