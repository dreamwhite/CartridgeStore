# Tranche 246 — Publication reconciliation

## Moduli separati

- `backend/src/consistency/reconciliation.ts`
  - scansione read-only di submission pending e verified;
  - verifica del catalog index e degli hash pubblicati;
  - rilevazione di journal incompleti, conflitti, file orfani e symlink;
  - classificazione e conteggio dei finding.
- `backend/src/consistency/publication.ts`
  - mantiene il workflow mutante di pubblicazione e compensation;
  - delega la diagnostica a `reconcilePublication` tramite callback di lettura.

## Motivazione SRP

La riconciliazione era una responsabilità read-only di grandi dimensioni
all'interno del servizio che esegue anche prepare, stage, replace, database
update e recovery. Il nuovo modulo separa la diagnostica senza acquisire
nuove responsabilità mutanti.

## Contratti preservati

- metodo pubblico `PublicationConsistencyService.reconcile()` invariato;
- codici, classificazioni, messaggi e conteggi dei finding invariati;
- controlli path, symlink, hash, journal e `scan_limit` invariati;
- nessuna modifica a workflow di pubblicazione, SQLite, endpoint o firmware.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe lunghe sul nuovo modulo — PASS.

## Rischi residui

`publication.ts` resta ampio perché contiene il workflow transazionale e le
operazioni di compensation. La riconciliazione estratta non modifica stato.

Il refactor Flask legacy è escluso su decisione del progetto perché il codice
è transitorio e destinato alla rimozione.

## Commit creati

Da creare dopo la verifica finale della tranche:

- `refactor(fastify-consistency): extract publication reconciliation`

## Prossima tranche

Analizzare i restanti moduli storage-v2 e workflow, separando solo confini
indipendenti e verificabili senza cambiare i contratti esistenti.
