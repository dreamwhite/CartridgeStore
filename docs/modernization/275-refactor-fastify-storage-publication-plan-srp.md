# Tranche 275 — Fastify storage-v2 publication plan

## Moduli separati

- `backend/src/storage-v2/workflow-publication-plan.ts`
- `backend/src/storage-v2/workflow.ts`

## Motivazione SRP

La fase di approvazione ricostruiva gli artifact, derivava icon e screenshot,
calcolava gli hash e costruiva gli object plan direttamente accanto alla
scrittura dell'intento durevole. Questa responsabilità è ora isolata in un
planner puro rispetto al database; il servizio conserva autenticazione,
transazioni, journal e transizioni di stato.

## Contratti preservati

- Sono invariati byte ricostruiti, media type, hash, dimensioni e chiavi degli
  oggetti pubblicati.
- Sono invariati metadata revisionati, colophon, errori di validazione e
  gestione degli artifact senza media.
- Non sono stati modificati schema SQLite, manifest journal, endpoint,
  autorizzazioni o fault boundary.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

La scrittura dell'intento e delle righe `storage_objects` resta nel servizio e
continua a condividere la stessa transazione e gli stessi fault boundary.
L'eventuale estrazione della visibilità database richiede una tranche distinta.

## Commit creato

- `refactor(fastify-storage): extract publication planning`

## Prossima tranche

Analizzare le query e la persistenza dell'intento di pubblicazione, senza
separare codice che deve restare atomico con il journal SQLite.
