# Tranche 244 — Application backup validation

## Moduli separati

- `backend/src/backup/validation.ts`
  - validazione dell'inventory dell'archivio;
  - checksum e corrispondenza tra manifest e file estratti;
  - verifica schema SQLite e migrazioni additive sul solo database staged;
  - preflight dei secret e riferimenti filesystem.
- `backend/src/backup/service.ts`
  - mantiene export, restore, journal, recovery point, rollback e cleanup;
  - delega il gate di validazione al modulo dedicato.

## Motivazione SRP

Il servizio backup combinava validazione preventiva dell'archivio con il
workflow mutante di restore. Il validator ora riceve dipendenze esplicite e
non esegue sostituzioni del database o del filesystem operativo.

## Contratti preservati

- formato backup v1/v2, manifest, inventory e checksum invariati;
- migrazioni applicate esclusivamente alla copia staged invariata;
- preflight secret e controlli schema invariati;
- restore, rollback, journal, autorizzazioni, schema SQLite e API invariati;
- nessuna modifica ai contratti firmware o ai dati operativi.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe lunghe sul nuovo validator — PASS.

## Rischi residui

`backup/service.ts` conserva il coordinamento mutante del restore e il
recovery journal. Il modulo `backup/validation.ts` non modifica lo storage
operativo e resta limitato alla copia estratta.

Il refactor Flask legacy è escluso su decisione del progetto perché il codice
è transitorio e destinato alla rimozione.

## Commit creati

Da creare dopo la verifica finale della tranche:

- `refactor(fastify-backup): extract archive validation`

## Prossima tranche

Continuare con i moduli backend residui solo quando emerga un confine di
responsabilità indipendente e verificabile.
