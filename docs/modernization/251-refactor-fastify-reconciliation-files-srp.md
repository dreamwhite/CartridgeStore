# Tranche 251 — Publication reconciliation filesystem scans

## Moduli separati

- `backend/src/consistency/reconciliation-files.ts`
  - scansione dei cartridge pubblicati non referenziati dall'indice;
  - rilevamento di symlink e file temporanei nei workspace di pubblicazione.
- `backend/src/consistency/reconciliation.ts`
  - mantiene la correlazione tra database, indice, journal e finding;
  - delega le scansioni filesystem specializzate.

## Motivazione SRP

La reconciliation aggregava controlli database, indice, journal e due walker
filesystem inline. I walker ora hanno un confine dedicato e ricevono solo il
root, lo stato indicizzato e il sink dei finding; la classificazione globale
resta nel servizio di reconciliation.

## Contratti preservati

- codici, classificazioni, messaggi e path dei finding invariati;
- limite di scansione, profondità massima e gestione symlink invariati;
- controlli journal/database/index invariati;
- nessuna modifica a schema SQLite, endpoint, autenticazione o firmware.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe lunghe sul nuovo adapter — PASS.

## Rischi residui

La reconciliation conserva la procedura aggregatrice perché deve ordinare i
finding e applicare le regole di correlazione tra fonti diverse. Non sono state
modificate operazioni di recovery o scritture.

## Commit creati

- `refactor(fastify-consistency): extract reconciliation filesystem scans`

## Prossima tranche

Proseguire con un modulo Fastify ancora voluminoso, scegliendo un adapter con
confine indipendente e verificabile senza cambiare la policy di readiness.
