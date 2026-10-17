# Tranche 204 — Fastify readiness inventory contracts

## Moduli separati

- `backend/src/readiness/inventory-contracts.ts` contiene ABI, version tuple,
  classificazioni, owner di rotta, entry di inventario e gate.
- `backend/src/readiness/inventory.ts` conserva l'inventario concreto, la
  matrice di retirement, il protocollo di handover e i blocker operativi.

## Motivazione SRP

L'inventory module conteneva sia i contratti del report sia il catalogo
documentale delle evidenze. I tipi e le costanti ABI sono ora separati dal
contenuto di readiness, senza introdurre trasformazioni o duplicare dati.

## Contratti preservati

- `inventory.ts` resta il barrel pubblico per ABI, version tuple, inventari,
  gate, matrice Flask e protocollo di handover.
- Non sono cambiati classification, ownership, blocker, versione schema,
  backup/publication tuple o contenuto delle evidenze.
- Nessun endpoint, database, autenticazione o dato operativo è stato cambiato.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS

## Rischi residui

La readiness inventory resta un modulo documentale ampio per mantenere nello
stesso snapshot evidenze, handover e retirement matrix. Non sono emersi altri
confini applicativi sicuri in questa fase.

## Commit creati

- `refactor(fastify-readiness): extract inventory contracts`

## Prossima tranche

Chiudere l'analisi Fastify documentando i moduli rimanenti non estratti per
assenza di confini indipendenti, quindi iniziare la fase Flask legacy con
estrazioni conservative e test di compatibilità.
