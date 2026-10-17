# Tranche 273 — Fastify storage-v2 workflow records

## Moduli separati

- `backend/src/storage-v2/workflow-records.ts`
- `backend/src/storage-v2/workflow.ts`

## Motivazione SRP

Il workflow canonico conteneva anche query delle submission, query degli
artifact, validazione dei metadati persistiti e mapping verso il record di
review pubblico. Queste responsabilità sono state raccolte in un adapter di
read model dedicato; il servizio mantiene l'orchestrazione, le transazioni e
le transizioni di pubblicazione.

## Contratti preservati

- Sono invariati endpoint, forme di `SubmissionRecord`, stati pubblici e
  mapping della cronologia review.
- Sono invariate query, ordinamento, limiti, errori e codici di errore.
- Non sono stati modificati schema SQLite, autenticazione, autorizzazioni o
  workflow di pubblicazione.
- I metodi e gli import pubblici di `workflow.ts` restano compatibili.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

`workflow.ts` mantiene ancora le responsabilità di scrittura, recovery e
visibilità canonica. Non sono state separate ulteriormente in questa tranche
per evitare astrazioni che attraversino transazioni e fault boundary.

## Commit creato

- `refactor(fastify-storage): extract workflow records adapter`

## Prossima tranche

Analizzare le responsabilità di scrittura e autorizzazione di
`storage-v2/workflow.ts`, separando solo confini reali e mantenendo i fault
boundary del workflow.
