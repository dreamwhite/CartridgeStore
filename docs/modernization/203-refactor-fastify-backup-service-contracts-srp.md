# Tranche 203 — Fastify application backup contracts

## Moduli separati

- `backend/src/backup/service-contracts.ts` contiene artifact, risultato di
  restore, fault point e opzioni del backup applicativo.
- `backend/src/backup/service.ts` mantiene export/import, validazione manifest,
  restore SQLite/filesystem, recovery e lock di manutenzione.

## Motivazione SRP

Il servizio di backup definiva i payload pubblici insieme alla coordinazione
di archivi, secret, schema e recovery. I contratti sono ora indipendenti dalla
procedura; la logica operativa resta concentrata per preservare atomicità e
rollback.

## Contratti preservati

- `service.ts` resta il barrel pubblico per `BackupService`, artifact, restore
  result, fault point e opzioni.
- Sono invariati formato v1/v2, cifratura, preflight dei secret, schema SQLite,
  journal di restore, rollback, route e response.
- Nessun dato operativo è stato modificato.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS

## Rischi residui

Il coordinamento restore resta volutamente unico per mantenere verificabili
insieme lock, recovery point, sostituzione SQLite/filesystem e rollback.

## Commit creati

- `refactor(fastify-backup): extract application backup contracts`

## Prossima tranche

Analizzare `backend/src/readiness/inventory.ts`; è principalmente un catalogo
di contratti e può essere separato senza toccare il calcolo della readiness.
