# Fastify backup operations SRP tranche

## Moduli separati

- `backend/src/backup/operations.ts` contiene utility operative condivise:
  timestamp, SHA-256, scrittura atomica, journal JSON, directory sicure e
  maintenance lock.
- `backend/src/backup/service.ts` conserva orchestrazione export/restore,
  validazione manifest, transazioni SQLite e recovery workflow.

## Motivazione SRP

Le operazioni atomiche su filesystem e lock sono un boundary tecnico
indipendente dal workflow di backup. L’estrazione riduce il servizio senza
spostare la logica transazionale che coordina database, filesystem e journal.

## Contratti preservati

- Formato dei journal, timestamp, digest, lock path e codici `BackupError`
  sono invariati.
- Non cambiano backup ABI, schema SQLite, autorizzazioni, route o retention.
- Nessun dato operativo è stato modificato.

## Verifica

- Node.js `24.20.0` — PASS.
- `pnpm --dir backend run typecheck` — PASS.
- `pnpm --dir backend run lint` — PASS.
- `pnpm --dir backend run test` — PASS, 59 file e 295 test.
- `pnpm --dir backend run build` — PASS.
- `git diff --check` — PASS.

## Rischi residui

La validazione schema e il restore restano nel servizio perché condividono
transazioni, recovery points e fault injection. Separarli richiede un confine
di integrazione più ampio e non è stato forzato.

## Commit

- `refactor(fastify-backup): extract backup operations`

## Prossima tranche

Proseguire con un audit dei moduli Fastify rimanenti; Flask legacy è
esplicitamente escluso dal refactoring.
