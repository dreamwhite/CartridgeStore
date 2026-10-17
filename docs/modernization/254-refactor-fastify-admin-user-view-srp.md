# Tranche 254 — Administrative user read model

## Moduli separati

- `backend/src/admin/user-view.ts`
  - query compatibile con le versioni dello schema account;
  - normalizzazione ruolo, stato e gruppi;
  - costruzione del `UserView` pubblico.
- `backend/src/admin/service.ts`
  - mantiene mutazioni, transazioni, autorizzazioni e audit;
  - delega la proiezione utente al read-model adapter.

## Motivazione SRP

La lettura e normalizzazione dell'utente era duplicata implicitamente tra
listing e mutazioni del servizio amministrativo. Il nuovo adapter separa il
read model dalle scritture e mantiene distinta la semantica dello stato per
lista e lettura singola.

## Contratti preservati

- shape `UserView`, ruolo, gruppi e campi account invariati;
- compatibilità con colonne account opzionali invariata;
- differenza esistente tra `account_status` del listing e della lettura
  singola preservata;
- transazioni, audit, RBAC, schema SQLite, endpoint e autenticazione invariati.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe lunghe sul nuovo adapter — PASS.

## Rischi residui

Le mutazioni utenti/gruppi restano nel service perché condividono invarianti
di amministrazione, revoca accessi e audit transazionale.

## Commit creati

- `refactor(fastify-admin): extract user read model`

## Prossima tranche

Continuare l'analisi dei servizi Fastify residui, privilegiando adapter di
lettura o codec con responsabilità singola e test di contratto esistenti.
