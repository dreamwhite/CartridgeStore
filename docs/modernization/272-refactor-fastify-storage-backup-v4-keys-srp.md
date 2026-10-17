# Tranche 272 — Fastify storage-v2 encrypted backup keys

## Moduli separati

- `backend/src/storage-v2/backup-v4-keys.ts`
- `backend/src/storage-v2/backup-v4.ts`

## Motivazione SRP

Provider in-memory, adapter del key registry e rotazione del registry sono
responsabilità indipendenti dalla cifratura, verifica e restore dell'archivio
backup-v4. Sono stati spostati in un modulo dedicato mantenendo il modulo
esistente come barrel pubblico.

## Contratti preservati

- Nessun formato encrypted backup-v4, envelope, marker, schema SQLite o
  autorizzazione è stato modificato.
- Sono invariati export pubblici, error code/message, percorsi, permessi file,
  modalità di rotazione e gestione delle chiavi storiche.
- I test provider e rotazione continuano a usare gli stessi contratti.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

`backup-v4.ts` mantiene l'orchestrazione cifratura/decrittazione e restore;
non è stata separata ulteriormente senza alterare i confini di fault handling.

## Commit creato

- `refactor(fastify-storage): extract backup-v4 key adapters`

## Prossima tranche

Analizzare `storage-v2/workflow.ts` per un eventuale adapter di validazione o
materializzazione che possa essere estratto senza modificare il workflow.
