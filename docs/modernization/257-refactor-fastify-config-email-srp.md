# Tranche 257 — Backend email environment adapter

## Moduli separati

- `backend/src/config/env-email.ts`
  - risoluzione del transport email;
  - default memory/disabled in base alla modalità auth;
  - validazione SMTP e relativi limiti/valori.
- `backend/src/config/env.ts`
  - mantiene la composizione globale e le validazioni cross-domain;
  - delega il sotto-dominio email al resolver dedicato.

## Motivazione SRP

La lettura delle impostazioni email era incorporata nel loader generale,
insieme a storage, auth, federation e backup. Il resolver ora concentra solo
il contratto outbound email, senza conoscere database o transazioni.

## Contratti preservati

- transport `disabled`, `memory`, `smtp` invariati;
- default, origin pubblico, host, porta e credenziali invariati;
- messaggi e condizioni di errore SMTP invariati;
- nessuna modifica a API, database, autenticazione o firmware.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe lunghe sul nuovo adapter — PASS.

## Rischi residui

Il loader conserva ancora policy auth e writer perché condividono dipendenze
incrociate e ordine di validazione. Non sono state introdotte nuove astrazioni
per ridurre soltanto il numero di righe.

## Commit creati

- `refactor(fastify-config): extract email environment adapter`

## Prossima tranche

Analizzare la validazione WebAuthn/origins come eventuale policy adapter
indipendente, preservando l'ordine degli errori di configurazione.
