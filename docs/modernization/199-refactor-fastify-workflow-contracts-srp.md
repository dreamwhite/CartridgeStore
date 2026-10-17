# Tranche 199 — Fastify canonical workflow contracts

## Moduli separati

- `backend/src/storage-v2/workflow-contracts.ts` contiene fault point, opzioni
  del workflow ed eventi di download.
- `backend/src/storage-v2/workflow.ts` mantiene il workflow transazionale di
  submission, review, pubblicazione, download e recovery.

## Motivazione SRP

Le opzioni e gli eventi pubblici erano definiti nello stesso modulo che gestisce
lease, staging, transazioni SQLite, promozione degli oggetti e recovery. Il
contratto è ora isolato; l'orchestratore conserva insieme le invarianti che
devono attraversare database e filesystem.

## Contratti preservati

- `workflow.ts` resta il barrel pubblico per `CanonicalWorkflowService`,
  `CanonicalWorkflowOptions`, `CanonicalDownloadEvent` e i fault point.
- Non sono cambiati stati del journal, SQL, autorizzazioni, policy, staging,
  route, response, schema SQLite o comportamento di recovery.
- Nessun dato operativo è stato modificato.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS

## Rischi residui

Il workflow resta grande perché coordina transazioni SQLite, lease, oggetti
content-addressed e recovery. Le helper interne sono ancora accoppiate a
queste invarianti; ulteriori estrazioni richiedono test più mirati sui confini
di promozione e visibilità.

## Commit creati

- `refactor(fastify-workflow): extract canonical workflow contracts`

## Prossima tranche

Analizzare `backend/src/federation/provider.ts`, individuando confini tra
validazione provider, protocolli OIDC/SAML e persistenza senza alterare la
federation ABI.
