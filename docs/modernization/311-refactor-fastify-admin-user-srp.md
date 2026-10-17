# Tranche 311 — administrative user mutations

## Moduli separati

- `backend/src/admin/user-service.ts`
  - creazione e aggiornamento degli utenti;
  - ruolo, stato account e disabilitazione;
  - revoca di token e accessi dopo modifiche sensibili;
  - sostituzione dei gruppi e cancellazione utenti;
  - invarianti sull'ultimo amministratore e sul gruppo `editors`.
- `backend/src/admin/service.ts`
  - mantiene `AdminIdentityService` come facciata compatibile;
  - delega le mutazioni utente;
  - continua a coordinare gruppi, ruoli e lettura audit.

## Motivazione SRP

`AdminIdentityService` aggregava due domini distinti: gestione degli utenti e
gestione dei gruppi. Il nuovo servizio concentra le regole di accesso e le
mutazioni utente, mentre il servizio esistente conserva la facciata pubblica e
il coordinamento delle proiezioni amministrative.

## Contratti preservati

- Nessun endpoint, response shape, schema SQLite o autorizzazione è cambiato.
- Sono preservati revoche, audit, transazioni immediate, controlli
  self-protection e invarianti dell'ultimo amministratore.
- `AdminIdentityService` conserva metodi ed export pubblici esistenti.
- Non sono stati modificati dati operativi, contratti firmware o dipendenze.
- Flask legacy è escluso dal perimetro della refactorizzazione.

## Test eseguiti

Con Node `24.20.0`:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe lunghe sui moduli modificati — PASS

## Rischi residui

La facciata amministrativa conserva ancora ruoli, gruppi e audit perché questi
sono già separati in servizi/read model coerenti. Ulteriori estrazioni saranno
valutate solo in presenza di responsabilità indipendenti e senza duplicare il
confine transazionale condiviso.

## Commit creati

- `ec3b0d9 refactor(fastify-admin): extract user service`

## Prossima tranche

Continuare l'analisi dei servizi Fastify residui, in particolare setup e
readiness, senza modificare il comportamento o i contratti pubblici.
