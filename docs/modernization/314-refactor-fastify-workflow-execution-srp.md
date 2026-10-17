# Tranche 314 — Fastify canonical workflow execution SRP

## Moduli separati

- `backend/src/storage-v2/workflow-execution.ts`
  - lettura e validazione del journal di pubblicazione canonica;
  - promozione e verifica degli oggetti nello storage;
  - transizioni SQLite e registrazione degli eventi;
  - visibilità atomica, cleanup e recovery all'avvio.
- `backend/src/storage-v2/workflow.ts`
  - mantiene la facciata `CanonicalWorkflowService`;
  - conserva upload, listing, dettaglio, approvazione, rifiuto e download;
  - delega l'esecuzione durevole senza cambiare gli import pubblici.

## Motivazione SRP

Il workflow applicativo gestisce submission e review, mentre l'esecuzione della
pubblicazione è una macchina a stati durevole con invarianti filesystem e
SQLite proprie. Il confine è stato estratto perché rappresenta un dominio
operativo distinto e viene usato sia dall'approvazione sia dal recovery dopo
riavvio.

## Contratti preservati

- invariati endpoint, response e interfacce del workflow;
- invariati stati del journal, eventi, fault point e recovery;
- invariati schema SQLite, storage object e autorizzazioni;
- invariati contratti firmware, ABI e compatibilità con il catalogo;
- nessuna dipendenza aggiunta;
- Flask legacy escluso dal refactoring su richiesta esplicita.

## Validazione

Eseguita con Node.js `24.20.0`:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS.

## Rischi residui

La suite Python legacy non è stata eseguita perché `pytest` non è disponibile
nell'ambiente corrente. Non sono state installate dipendenze.

## Commit

- `24e7c8d refactor(fastify-workflow): extract durable execution`

## Prossima tranche

Verifica finale di coerenza del refactoring Fastify e del frontend già trattato.
Non sono previste ulteriori estrazioni automatiche: `env`, `setup`, `backup`,
`backup-v4`, `federation/provider` e `readiness/inventory` non mostrano un
confine SRP abbastanza netto da giustificare altro churn.
