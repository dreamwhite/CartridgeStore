# Tranche 242 — Rejection journal adapter

## Moduli separati

- `backend/src/review/rejection-journal.ts`
  - formato e validazione del journal di rejection;
  - transizioni persistite;
  - validazione dei path e dei pending directory;
  - creazione della root del journal.
- `backend/src/review/service.ts`
  - mantiene listing, dettaglio, approve, reject e reconcile;
  - mantiene le transazioni SQLite e delega il journal filesystem.

## Motivazione SRP

Il servizio review gestiva sia il workflow submission sia la persistenza
filesystem delle rejection. Il nuovo adapter concentra il formato journal e i
controlli di sicurezza dei path, lasciando al servizio il coordinamento tra
database, pubblicazione e cleanup.

## Contratti preservati

- API pubblica di `ReviewService` invariata;
- stati e formato del journal invariati;
- nomi delle directory, path pending, fault points e recovery invariati;
- transazioni SQLite, autorizzazioni, endpoint e schema invariati;
- nessuna modifica ai contratti firmware o ai dati operativi.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe lunghe sul nuovo adapter — PASS.

## Rischi residui

`review/service.ts` conserva la parte di coordinamento e le query storiche
delle submission. Non sono state introdotte nuove astrazioni oltre al confine
filesystem già presente.

Il refactor Flask legacy è escluso su decisione del progetto perché il codice
è transitorio e destinato alla rimozione.

## Commit creati

Da creare dopo la verifica finale della tranche:

- `refactor(fastify-review): extract rejection journal adapter`

## Prossima tranche

Continuare l'analisi dei moduli backend residui, privilegiando confini
indipendenti e verificabili senza alterare i contratti esistenti.
