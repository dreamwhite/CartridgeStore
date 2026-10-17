# Tranche 249 — Canonical workflow payload materialization

## Moduli separati

- `backend/src/storage-v2/workflow-payloads.ts`
  - ricostruzione del cartridge revisionato;
  - estrazione e verifica degli oggetti media;
  - confronto tra payload ricostruiti e piano persistito.
- `backend/src/storage-v2/workflow.ts`
  - mantiene il caricamento delle righe SQLite e l'orchestrazione del journal;
  - delega la materializzazione all'adapter dedicato.

## Motivazione SRP

La ricostruzione dei byte pubblicabili e la verifica del relativo manifest erano
mescolate alle transizioni di approvazione, promozione e visibility. L'adapter
ora concentra il lavoro deterministico sui payload, mentre il servizio resta
responsabile del workflow transazionale.

## Contratti preservati

- ricostruzione PRG32, metadata revisionati, colophon e media invariati;
- hash, dimensioni, object id e staging key del manifest invariati;
- errori e codici di integrità invariati;
- schema SQLite, journal, endpoint, autenticazione e contratti firmware
  invariati;
- nessuna modifica ai dati operativi.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe lunghe sul nuovo adapter — PASS.

## Rischi residui

La pianificazione degli oggetti resta nel metodo di approvazione perché è
legata alla transazione che crea il journal. Sarà estratta solo con un confine
che non separi impropriamente la validazione dalla persistenza atomica.

## Commit creati

- `refactor(fastify-workflow): extract payload materialization`

## Prossima tranche

Analizzare la pianificazione della publication intent e le transizioni del
journal per un'eventuale separazione ulteriore, mantenendo invariato il
protocollo di recovery.
