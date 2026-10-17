# Tranche 241 — API token management adapter

## Moduli separati

- `backend/src/auth/token-management.ts`
  - elenco dei token con soli metadati pubblici;
  - creazione del token e generazione del valore one-time;
  - aggiornamento dell'etichetta;
  - revoca vincolata all'utente proprietario.
- `backend/src/auth/service.ts`
  - conserva i metodi pubblici compatibili di `AuthService`;
  - delega le operazioni CRUD token al modulo dedicato.

## Motivazione SRP

Le operazioni sui token API erano implementate dentro il servizio che gestisce
anche sessioni, login, bootstrap, registrazione e password reset. Il nuovo
modulo isola il confine di persistenza e ownership dei token senza duplicare
logica di autenticazione o cambiare il servizio pubblico.

## Contratti preservati

- metodi pubblici `listTokens`, `createToken`, `updateToken` e `revokeToken`
  invariati;
- formato del token `prg32_` invariato;
- hashing, limiti label, ordinamento, risposte e messaggi di errore invariati;
- query SQLite e vincolo di ownership invariati;
- nessuna modifica a route, autorizzazioni, schema o contratti firmware.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe lunghe sul nuovo adapter — PASS.

## Rischi residui

`auth/service.ts` mantiene ancora i workflow di login, registrazione e reset
password, che hanno transazioni e compatibilità storiche più estese. Saranno
separati solo con confini verificabili e senza modificare il comportamento.

Il refactor Flask legacy è escluso su decisione del progetto perché il codice
è transitorio e destinato alla rimozione.

## Commit creati

Da creare dopo la verifica finale della tranche:

- `refactor(fastify-auth): extract API token management`

## Prossima tranche

Analizzare il prossimo servizio backend con responsabilità indipendenti,
mantenendo i barrel pubblici e ripetendo la validazione completa del dominio.
