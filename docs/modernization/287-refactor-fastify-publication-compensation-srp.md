# Tranche 287 — Fastify publication compensation

## Moduli separati

- `backend/src/consistency/publication-compensation.ts`
- `backend/src/consistency/publication.ts`

## Motivazione SRP

`PublicationConsistencyService` conteneva anche la compensazione di
operazioni ambigue: ripristino dei file pubblicati, ripristino dell'indice,
rollback dello stato della submission e cleanup dello staging. Questa
responsabilità è stata estratta in `compensatePublicationOperation`; il
servizio mantiene lock, journal e delega con callback esplicite per fault e
transizioni.

## Contratti preservati

- `PublicationConsistencyService.recover` mantiene la stessa API e gli stessi
  stati del journal.
- Sono invariati hash attesi, backup, controlli di ambiguità, codici errore,
  aggiornamento SQLite e fault point.
- Non sono cambiati endpoint, response, autenticazione, schema SQLite o
  contratti firmware.
- Flask legacy è stato lasciato intatto.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- controllo righe lunghe del nuovo modulo — PASS
- `git diff --check` — PASS

## Rischi residui

La pipeline principale di pubblicazione rimane nel servizio per preservare
l'ordine transazionale tra staging, indice e database. Le ulteriori estrazioni
dovranno mantenere questo ordine e i recovery point già coperti dai test.

## Commit

- `refactor(fastify-storage): extract publication compensation`

## Prossima tranche

Continuare l’analisi dei moduli Fastify residui, con priorità ai boundary di
reconciliation o migration se separabili senza duplicare lo state machine.
