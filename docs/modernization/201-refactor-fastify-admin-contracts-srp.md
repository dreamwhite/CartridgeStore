# Tranche 201 — Fastify administrative service contracts

## Moduli separati

- `backend/src/admin/service-contracts.ts` contiene contesto di mutazione,
  input utente e viste pubbliche per utenti e gruppi.
- `backend/src/admin/service.ts` mantiene normalizzazione, RBAC implicito,
  transazioni SQLite, invalidazione accessi, gruppi e audit.

## Motivazione SRP

Il servizio amministrativo definiva i contratti dei payload e delle viste
insieme alle mutazioni di identità e gruppi. I contratti ora sono indipendenti
dalla persistenza; il servizio conserva le invarianti di autorizzazione,
transazione e audit che devono essere valutate insieme.

## Contratti preservati

- `service.ts` resta il barrel pubblico per `AdminError`,
  `AdminIdentityService` e tutti i tipi precedenti.
- Non sono cambiati RBAC, invalidazione token/sessioni, protezione del final
  administrator, audit, schema SQLite, route o response.
- Nessun dato operativo è stato modificato.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS

## Rischi residui

L'implementazione resta concentrata per mantenere atomiche mutazioni,
invalidazione degli accessi e audit. Un'ulteriore divisione per user/group
richiede attenzione alle transazioni condivise.

## Commit creati

- `refactor(fastify-admin): extract administrative service contracts`

## Prossima tranche

Analizzare `backend/src/setup/service.ts` e separare stato/contratti dalla
validazione e dalle mutazioni della procedura di setup.
