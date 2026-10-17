# Tranche 288 — Fastify reconciliation operations

## Moduli separati

- `backend/src/consistency/reconciliation-operations.ts`
- `backend/src/consistency/reconciliation.ts`

## Motivazione SRP

`reconciliation.ts` eseguiva anche la scansione dei journal di pubblicazione e
il calcolo dei target cancellati intenzionalmente. Questi dati costituiscono un
read model operativo distinto dai controlli su submission, indice e filesystem
e sono stati estratti in `scanPublicationOperations`.

## Contratti preservati

- `reconcilePublication` mantiene la stessa firma e lo stesso report.
- Sono invariati findings `JOURNAL_CORRUPT`, `JOURNAL_SCAN_FAILED`, target
  cancellati intenzionalmente e classificazioni di recovery.
- La reconciliation resta read-only; non sono cambiati endpoint, response,
  autenticazione, schema SQLite o contratti firmware.
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

Il coordinamento finale dei findings resta nel modulo principale per mantenere
un unico report ordinato. Le scansioni file e indice restano separate dai
journal e non sono state ricombinate.

## Commit

- `refactor(fastify-storage): extract reconciliation operations`

## Prossima tranche

Continuare l’analisi dei moduli Fastify ancora grandi, evitando estrazioni
puramente meccaniche quando non esiste un boundary di dominio stabile.
