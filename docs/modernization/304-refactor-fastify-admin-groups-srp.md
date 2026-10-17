# Tranche 304 — Fastify administrative groups

## Moduli separati

- `backend/src/admin/group-service.ts`
- `backend/src/admin/service.ts`

## Motivazione SRP

`AdminIdentityService` gestiva nello stesso modulo utenti, gruppi, ruoli e
audit. Il CRUD dei gruppi e la persistenza delle membership sono stati
spostati in `AdminGroupService`, riusando lo stesso runner transazionale e di
audit. `AdminIdentityService` mantiene la facciata pubblica e delega le
operazioni senza cambiare i consumer delle route.

## Contratti preservati

- Restano invariati route, response shape, errori e codici HTTP.
- Restano invariati i controlli sul gruppo protetto `editors`, la validazione
  degli ID e dei nomi, le membership e l’invalidazione dei token utente.
- Restano invariati transazioni SQLite, audit attempt/committed/failed e
  gestione degli errori di vincolo.
- Non sono cambiate autorizzazioni, schema SQLite o contratti firmware.
- Flask legacy è stato lasciato fuori dall’intervento come richiesto.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- controllo righe lunghe del nuovo modulo — PASS
- `git diff --check` — PASS

## Rischi residui

La facciata amministrativa conserva ancora le responsabilità utente, stato
account, ruoli e audit; saranno valutate separatamente solo se emergeranno
confini che non duplicano il runner transazionale.

## Commit

- `refactor(fastify-admin): extract group service`

## Prossima tranche

Continuare l’analisi Fastify sui moduli storage e workflow, evitando estrazioni
che possano alterare transazioni, recovery o compatibilità.
