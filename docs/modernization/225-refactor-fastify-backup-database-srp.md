# Fastify backup database SRP tranche

## Moduli separati

- `backend/src/backup/database.ts` contiene fingerprint, validazione di
  compatibilità schema e restore transazionale della copia SQLite.
- `backend/src/backup/service.ts` conserva export/import dell’archivio,
  journal di restore, lock di manutenzione, filesystem e rollback.

## Motivazione SRP

La validazione e il ripristino del database hanno un confine tecnico distinto
dalla gestione dell’archivio e del ciclo di vita dell’operazione. L’estrazione
mantiene nel servizio tutte le decisioni di orchestrazione e lascia il modulo
database focalizzato sulle invarianti SQLite.

## Contratti preservati

- Nessun formato backup, ABI, schema SQLite, migrazione o response è cambiato.
- Restano invariati controlli di integrità, foreign key, fingerprint, tabelle
  federate, invalidazione sessioni e comportamento di rollback.
- Nessuna autorizzazione, sicurezza o dato operativo è stato modificato.

## Verifica

- Node.js `24.20.0` — PASS.
- `pnpm --dir backend run typecheck` — PASS.
- `pnpm --dir backend run lint` — PASS.
- `pnpm --dir backend run test` — PASS, 59 file e 295 test.
- `pnpm --dir backend run build` — PASS.
- `git diff --check` — PASS.
- Il nuovo modulo non contiene righe oltre 100 caratteri.

## Rischi residui

Il servizio backup resta ampio perché coordina archivio, staging, recovery
journal, filesystem e rollback. Separare ulteriormente queste fasi richiede
test di interruzione dedicati per non alterare l’atomicità del restore.

## Commit

- `refactor(fastify-backup): extract database restore boundary`

## Prossima tranche

Continuare l’audit Fastify/CLI/frontend con estrazioni limitate a contratti,
codec o adapter autonomi; Flask legacy resta escluso.
