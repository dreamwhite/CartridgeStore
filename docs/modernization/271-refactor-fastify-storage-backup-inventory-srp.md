# Tranche 271 — Fastify storage-v2 backup inventory

## Moduli separati

- `backend/src/storage-v2/backup-inventory.ts`
- `backend/src/storage-v2/backup.ts`

## Motivazione SRP

La costruzione dell'inventario backup legge identità degli oggetti e dello
staging, raccoglie journal/quarantine/compatibility e determina il materiale
di recovery. È stata separata dall'orchestrazione di snapshot, archivio,
verifica e restore.

## Contratti preservati

- Nessun formato ZIP, manifest, hash, schema SQLite o contratto di backup è
  stato modificato.
- Sono invariati query, percorsi archivio, classificazioni, fault point,
  ordinamento e messaggi/codici `BackupError`.
- Sono invariati gli export pubblici di `backup.ts`; il nuovo modulo espone
  soltanto il boundary interno dell'inventario.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

`storage-v2/backup.ts` mantiene ancora l'orchestrazione di verifica e restore;
non è stata ulteriormente scomposta senza un boundary applicativo più netto.

## Commit creato

- `refactor(fastify-storage): extract backup inventory`

## Prossima tranche

Analizzare i moduli storage-v2/workflow o readiness e procedere solo dove
esista un confine di responsabilità verificabile.
