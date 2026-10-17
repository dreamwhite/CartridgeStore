# Fastify workflow codec SRP tranche

## Moduli separati

- `backend/src/storage-v2/workflow-codecs.ts` contiene serializzazione JSON,
  identificatori, digest SHA-256, rilevamento dei media type, parsing dei
  payload persistiti e normalizzazione dei metadati del workflow.
- `backend/src/storage-v2/workflow.ts` conserva orchestrazione, accesso a
  SQLite e filesystem, autorizzazione e transizioni della pubblicazione.

## Motivazione SRP

Le trasformazioni pure dei payload non richiedono lo stato del servizio. Il
confine riduce il servizio di workflow senza separare artificialmente le
operazioni che devono coordinare database, staging e pubblicazione.

## Contratti preservati

- Nessun endpoint, response shape, stato persistito o schema SQLite è cambiato.
- Sono invariati digest, media type, stati pubblici, gestione degli errori e
  metadati pubblicati.
- Nessuna autorizzazione, autenticazione, configurazione o dato operativo è
  stato modificato.

## Verifica

- Node.js `24.20.0` — PASS.
- `pnpm --dir backend run typecheck` — PASS.
- `pnpm --dir backend run lint` — PASS.
- `pnpm --dir backend run test` — PASS, 59 file e 295 test.
- `pnpm --dir backend run build` — PASS.
- `git diff --check` — PASS.
- Il nuovo modulo non contiene righe oltre 100 caratteri.

## Rischi residui

`CanonicalWorkflowService` resta un orchestratore ampio perché coordina
transazioni, staging, lock, recupero e pubblicazione. Ulteriori estrazioni
dovranno mantenere unite queste transizioni per evitare cambiamenti impliciti
di atomicità.

## Commit

- `refactor(fastify-workflow): extract workflow codecs`

## Prossima tranche

Continuare l’audit dei moduli Fastify rimanenti, privilegiando confini puri o
adapter con dipendenze indipendenti e mantenendo Flask legacy escluso.
