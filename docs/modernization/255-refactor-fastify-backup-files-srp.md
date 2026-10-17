# Tranche 255 — Canonical backup file capture

## Moduli separati

- `backend/src/storage-v2/backup-files.ts`
  - validazione e risoluzione delle storage key;
  - cattura stabile dei file referenziati dal database;
  - enumerazione di staging, journal, quarantine e compatibility files.
- `backend/src/storage-v2/backup.ts`
  - mantiene inventory semantico, manifest, archivio e restore;
  - delega la cattura fisica dei file all'adapter.

## Motivazione SRP

La cattura POSIX stabile e l'enumerazione degli oggetti di recovery erano
mescolate alla costruzione dell'inventory canonico e del manifest. L'adapter
ora concentra descriptor, fsync, controllo sostituzioni, symlink e duplicate
path, lasciando al servizio il significato degli oggetti e delle categorie.

## Contratti preservati

- storage key, path safety, hash, size e categorie inventory invariati;
- controllo symlink, file replacement, unlink dopo open, fsync e duplicate
  entry invariati;
- ordine delle query SQLite e directory di recovery invariati;
- formato backup, restore, schema, endpoint, autenticazione e firmware
  invariati.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir frontend run typecheck` — PASS;
- `pnpm --dir frontend run lint` — PASS;
- `pnpm --dir frontend run test` — PASS, 51 file e 116 test;
- `pnpm --dir frontend run build` — PASS;
- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe lunghe sul nuovo adapter — PASS.

## Rischi residui

La costruzione dell'inventory resta nel servizio backup perché combina identità
SQLite, recovery state e semantica delle categorie archivio.

## Commit creati

- `refactor(fastify-backup): extract canonical file capture`

## Prossima tranche

Analizzare il rimanente `config/env.ts` e i servizi Fastify senza introdurre
una nuova gerarchia astratta per la sola riduzione del numero di righe.
