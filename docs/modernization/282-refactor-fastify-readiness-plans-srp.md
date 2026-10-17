# Tranche 282 — Fastify readiness plans

## Moduli separati

- `backend/src/readiness/readiness-plans.ts`
- `backend/src/readiness/inventory.ts`

## Motivazione SRP

`inventory.ts` conteneva sia l'inventario delle route sia i piani operativi
usati per valutare la readiness della migrazione. I gate, la matrice di
retirement, il protocollo di handover e i blocker sono stati estratti in un
modulo dedicato. `inventory.ts` conserva gli export pubblici come barrel di
compatibilità.

## Contratti preservati

- `ROUTE_INVENTORY` è invariato.
- `READINESS_GATES`, `FLASK_RETIREMENT_MATRIX`, `HANDOVER_PROTOCOL` e
  `OPERATIONAL_BLOCKERS` restano importabili da `readiness/inventory.ts`.
- Non sono cambiati route, response, autenticazione, database o contratti
  firmware.
- Flask legacy è stato lasciato intatto; questo refactoring riguarda solo la
  separazione strutturale del modulo Fastify readiness.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- controllo righe lunghe del nuovo modulo — PASS
- `git diff --check` — PASS

## Rischi residui

L'inventario delle route rimane intenzionalmente nel modulo originale perché
contiene dati e classificazioni che costituiscono un unico read model operativo.
Una successiva estrazione dovrà mantenere gli stessi export e verificare i
report di migrazione.

## Commit

- `refactor(fastify-readiness): extract readiness plans`

## Prossima tranche

Analizzare il prossimo modulo Fastify con responsabilità realmente distinte,
partendo dai servizi di backup o dai read model ancora aggregati.
