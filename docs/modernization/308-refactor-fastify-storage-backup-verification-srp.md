# Tranche 308 — Fastify canonical backup verification

## Moduli separati

- `backend/src/storage-v2/backup-verification.ts`
- `backend/src/storage-v2/backup.ts`

## Motivazione SRP

`backup.ts` coordinava creazione, restore e verifica completa degli archivi.
La verifica del manifest, del sidecar, dell’inventory, dell’integrità SQLite
e dei checksum degli oggetti è stata estratta in un modulo dedicato; il file
principale mantiene la facciata pubblica e delega il workflow verify.

## Contratti preservati

- Restano invariati ABI, manifest, version tuple, limiti e codici di errore.
- Restano invariati i controlli su inventory, oggetti, staging, SQLite e
  checksum dell’archivio.
- Restano invariati autorizzazioni, route, schema SQLite, marker e restore.
- `backup.ts` mantiene l’export pubblico `verifyCanonicalBackup` come wrapper
  di compatibilità.
- Non sono cambiate autenticazione o contratti firmware.
- Flask legacy è stato lasciato fuori dall’intervento come richiesto.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- controllo righe lunghe del nuovo modulo — PASS
- `git diff --check` — PASS

## Rischi residui

`backup.ts` conserva ancora creazione e restore, che condividono snapshot,
journal e fault points; ulteriori estrazioni saranno valutate senza duplicare
le garanzie di recovery.

## Commit

- `refactor(fastify-storage): extract backup verification`

## Prossima tranche

Continuare l’audit dei moduli Fastify e dei componenti frontend ancora grandi,
con priorità ai confini già presenti e verificabili.
