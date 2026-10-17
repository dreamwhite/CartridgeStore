# Tranche 240 — Canonical backup archive adapter

## Moduli separati

- `backend/src/storage-v2/backup-archive.ts`
  - modello degli ingressi dell'archivio;
  - streaming dei file con hash SHA-256 e CRC32;
  - scrittura del local header, central directory e end record ZIP;
  - previsione della dimensione dell'archivio.
- `backend/src/storage-v2/backup.ts`
  - mantiene inventario, snapshot SQLite, manifest, verifica e restore;
  - delega la sola serializzazione ZIP all'adapter dedicato.

## Motivazione SRP

La costruzione binaria dell'archivio era mescolata alla raccolta
dell'inventario e al workflow di backup/restore. L'estrazione isola il confine
di serializzazione ZIP senza introdurre un nuovo formato o una nuova
dipendenza.

## Contratti preservati

- ABI e manifest del backup canonico invariati;
- formato ZIP non compresso, ordine delle entry, checksum e marker invariati;
- fault points del backup invariati;
- API pubbliche di `storage-v2/backup.ts` invariata;
- nessuna modifica a SQLite, storage, autorizzazioni o endpoint.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe lunghe sul nuovo adapter — PASS.

## Rischi residui

`backup.ts` conserva altre responsabilità storiche, tra cui inventario,
verifica del manifest e restore. Saranno separate solo quando il confine sarà
indipendente e verificabile senza cambiare il comportamento.

Il refactor Flask legacy è escluso su decisione del progetto: quel codice è
transitorio e non viene ulteriormente ristrutturato.

## Commit creati

Da creare dopo la verifica finale della tranche:

- `refactor(fastify-backup): extract canonical archive adapter`

## Prossima tranche

Analizzare il prossimo modulo backend ad alta responsabilità, mantenendo
separati i cambiamenti per dominio e ripetendo typecheck, lint, test e build.
