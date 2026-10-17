# Tranche 283 — Fastify backup restore workflow

## Moduli separati

- `backend/src/backup/restore-workflow.ts`
- `backend/src/backup/service.ts`

## Motivazione SRP

`BackupService` gestiva contemporaneamente la costruzione dell'export, il
journal delle operazioni, la creazione dei recovery point, la validazione del
restore, la sostituzione dei dati e il rollback. Il workflow stateful di
restore è stato estratto in `BackupRestoreWorkflow`; `BackupService` resta la
facciata usata dall'applicazione e mantiene export, cleanup e compatibilità
degli import pubblici.

## Contratti preservati

- `BackupService` mantiene la stessa API pubblica e gli stessi tipi esportati.
- Le fasi del journal, i codici errore, i fault point e le procedure di
  rollback sono invariati.
- Il punto interno `createRecoveryPoint` usato dai test resta disponibile
  tramite la facciata.
- Non sono cambiati endpoint, response, autorizzazioni, schema SQLite,
  cifratura o contratti firmware.
- Flask legacy è stato lasciato intatto.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- controllo righe lunghe del nuovo modulo — PASS
- `git diff --check` — PASS

Il test multiplayer differenziale ha avuto un singolo 500 transitorio durante
la prima esecuzione parallela; il test isolato e la suite completa successiva
sono passati senza modifiche al relativo codice.

## Rischi residui

La facciata backup conserva la responsabilità di inizializzare le directory,
coordinare l'export e delegare il restore. I moduli di formato, archivio,
inventario e validazione restano collaboratori separati e non sono stati
accorpati.

## Commit

- `refactor(fastify-backup): extract restore workflow`

## Prossima tranche

Analizzare i rimanenti servizi Fastify, con priorità a `config/env.ts` e ai
servizi amministrativi/setup solo dove esistano confini di responsabilità
ulteriori e verificabili.
