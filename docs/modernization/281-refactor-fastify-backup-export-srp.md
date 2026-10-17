# Tranche 281 — Fastify backup export

## Moduli separati

- `backend/src/backup/exporter.ts`
- `backend/src/backup/service.ts`

## Motivazione SRP

`BackupService` conteneva sia la costruzione dell'archivio export sia il
coordinamento del restore con journal, recovery point e rollback. La raccolta
dei file, costruzione del manifest, validazione ZIP e cifratura sono state
estratte in un exporter dedicato; il servizio mantiene lock e restore atomico.

## Contratti preservati

- Sono invariati manifest v2, ABI, fingerprint schema, inventory, limiti,
  nomi file, permessi, cifratura e preflight dei secret.
- Sono invariati errori, codici, cleanup dello staging e comportamento di
  export con o senza password.
- Non sono stati modificati restore, marker, journal, schema SQLite o dati
  operativi.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

Il percorso restore/recovery resta nel servizio perché coordina journal,
replacement SQLite/filesystem, fault injection e rollback compensativo.

## Commit creato

- `refactor(fastify-backup): extract backup exporter`

## Prossima tranche

Analizzare il percorso restore per estrarre solo validazione/preparazione
staging, senza separare le transizioni di journal dalla mutazione atomica.
