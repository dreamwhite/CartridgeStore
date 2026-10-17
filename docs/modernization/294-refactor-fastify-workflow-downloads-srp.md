# Tranche 294 — Fastify canonical workflow download telemetry

## Moduli separati

- `backend/src/storage-v2/workflow-downloads.ts`
- `backend/src/storage-v2/workflow.ts`

## Motivazione SRP

`CanonicalWorkflowService` coordinava submission, review, pubblicazione,
recovery e anche la persistenza della telemetria dei download. La scrittura
del record di download è stata estratta in `recordCanonicalDownload`, che
riceve il database e l’orologio dal coordinatore senza assumere responsabilità
sulla state machine di pubblicazione.

## Contratti preservati

- Restano invariati query di disponibilità, hash dell’IP, normalizzazione dello
  user agent, transazione SQLite e stato iniziale `started`.
- Restano invariati errori e rollback della telemetria.
- Non sono cambiati endpoint, response, schema SQLite, autenticazione o
  contratti firmware.
- Flask legacy è stato lasciato fuori dall’intervento.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- controllo righe lunghe del nuovo modulo — PASS
- `git diff --check` — PASS

## Rischi residui

Il coordinatore continua a fornire il database canonico e l’orologio, quindi
la modifica non introduce un nuovo ciclo di vita o una seconda transazione.
La telemetria resta parte del workflow Fastify e non viene duplicata.

## Commit

- `refactor(fastify-workflow): extract download telemetry`

## Prossima tranche

Continuare l’analisi del workflow canonico e dei servizi Fastify, estraendo
solo query o responsabilità con confini indipendenti dalla state machine.
