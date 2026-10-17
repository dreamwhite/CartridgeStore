# Tranche 295 — Fastify canonical workflow queries

## Moduli separati

- `backend/src/storage-v2/workflow-queries.ts`
- `backend/src/storage-v2/workflow.ts`

## Motivazione SRP

Le letture delle submission e la paginazione dell’elenco personale erano
implementate direttamente nel servizio che coordina upload, review,
pubblicazione e recovery. Sono state estratte in funzioni di query/read model;
il servizio mantiene il coordinamento e continua a esporre la stessa interfaccia
`ReviewWorkflowService`.

## Contratti preservati

- Restano invariati gli alias di stato `all`, `pending` e `verified`.
- Restano invariati ordinamento, limite amministrativo, paginazione, mapping
  dei campi e valori `null` della response.
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

Le query restano intenzionalmente dipendenti dai read model canonici esistenti
e non introducono repository generici o astrazioni condivise premature.

## Commit

- `refactor(fastify-workflow): extract submission queries`

## Prossima tranche

Continuare l’analisi del workflow canonico e dei servizi Fastify, evitando di
separare codice che rappresenta un’unica transazione o state machine.
