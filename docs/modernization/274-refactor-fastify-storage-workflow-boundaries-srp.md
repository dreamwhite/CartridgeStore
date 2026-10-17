# Tranche 274 — Fastify storage-v2 workflow boundaries

## Moduli separati

- `backend/src/storage-v2/workflow-authorization.ts`
- `backend/src/storage-v2/workflow-input.ts`
- `backend/src/storage-v2/workflow.ts`

## Motivazione SRP

Il servizio di pubblicazione conteneva due responsabilità indipendenti
dall'orchestrazione: la risoluzione del principal contro l'account canonico e
la validazione/preparazione del bundle ZIP. Sono state estratte in adapter
dedicati; il servizio conserva le transazioni, il workflow di review e i fault
boundary di recovery.

## Contratti preservati

- Sono invariati endpoint, autenticazione, ruoli, autorizzazioni e messaggi e
  codici di errore.
- Sono invariati parser ZIP, limiti, preparazione dei bundle e gestione delle
  eccezioni di validazione.
- Non sono stati modificati schema SQLite, dati operativi, contratti firmware
  o stato del workflow di pubblicazione.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sui nuovi moduli — PASS

## Rischi residui

`workflow.ts` mantiene ancora la logica di scrittura delle submission,
approvazione, rigetto, promozione degli oggetti, visibilità e recovery. Questi
confini attraversano transazioni e fault injection e richiedono tranche
separate.

## Commit creato

- `refactor(fastify-storage): extract workflow input boundaries`

## Prossima tranche

Analizzare il percorso di registrazione delle submission e la costruzione del
manifest di pubblicazione per estrarre solo responsabilità indipendenti senza
spostare i confini transazionali.
