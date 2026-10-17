# Tranche 252 — Canonical backup validation boundary

## Moduli separati

- `backend/src/storage-v2/backup-validation.ts`
  - hashing streamed dei file;
  - JSON canonico e fingerprint dello schema;
  - verifica integrità/versione SQLite e rilevamento recovery incompleta.
- `backend/src/storage-v2/backup.ts`
  - mantiene inventory, cattura snapshot, archivio e restore;
  - delega i controlli condivisi al modulo di validazione.

## Motivazione SRP

I controlli di identità file, schema SQLite e stato di recovery erano
mescolati alle operazioni di copia e archivio. Il nuovo modulo concentra le
invarianti di validazione riutilizzate da verify, create e restore, senza
separare le operazioni che devono restare coordinate con lo snapshot.

## Contratti preservati

- hash SHA-256, JSON canonico e fingerprint schema invariati;
- controlli SQLite, version tuple, tabelle obbligatorie e recovery invariati;
- limiti, errori, formati backup-v3, restore state e marker invariati;
- schema SQLite, dati operativi, endpoint, autenticazione e firmware invariati.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe lunghe sul nuovo modulo — PASS.

## Rischi residui

Le operazioni di cattura stabile, inventory e restore restano nel modulo
backup perché dipendono dall'ordine dello snapshot e dal journal di restore.

## Commit creati

- `refactor(fastify-backup): extract backup validation`

## Prossima tranche

Analizzare gli adapter di snapshot/cattura del backup solo se separabili senza
alterare la coerenza tra database, filesystem e manifest.
