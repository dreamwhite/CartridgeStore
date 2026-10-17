# Tranche 312 — canonical backup workflows

## Moduli separati

- `backend/src/storage-v2/backup-creation.ts`
  - autorizzazione e modalità snapshot;
  - snapshot SQLite e cattura dei file referenziati;
  - costruzione del manifest e dell'archivio ZIP;
  - verifica post-creazione e marker di completamento;
  - quarantena degli output incompleti.
- `backend/src/storage-v2/backup-restore.ts`
  - validazione del target disposable;
  - estrazione e promozione del database;
  - ripristino di oggetti, staging e journal;
  - audit finale e gestione dello stato `recovery_required`.
- `backend/src/storage-v2/backup.ts`
  - resta il compatibility facade per tipi, costanti e funzioni pubbliche;
  - mantiene `verifyCanonicalBackup` e `assertRestoreTargetNotReady`.

## Motivazione SRP

Il modulo backup aggregava due workflow indipendenti, con lifecycle, fault
points e cleanup differenti: creazione dell'archivio e restore del target. La
separazione riduce il coordinamento nella facciata e rende espliciti i confini
di snapshot/quarantena e di ripristino/journal senza introdurre nuove
astrazioni condivise non necessarie.

## Contratti preservati

- Nessun endpoint, response shape, schema SQLite o autorizzazione è cambiato.
- Sono preservati ABI, manifest, hash, limiti, fault points, marker e codici di
  errore del backup canonical.
- La facciata `backup.ts` conserva export, tipi e funzioni pubbliche esistenti.
- Non sono stati modificati dati operativi, contratti firmware o dipendenze.
- Flask legacy è escluso dal perimetro della refactorizzazione.

## Test eseguiti

Con Node `24.20.0`:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe lunghe sui moduli modificati — PASS

## Rischi residui

I workflow continuano a condividere il modulo di verifica canonical e gli
helper di manifest/restore I/O. Sono confini intenzionali: entrambi devono
preservare lo stesso contratto di autenticità e integrità dell'archivio.

## Commit creati

- `dac753f refactor(fastify-storage): split backup workflows`

## Prossima tranche

Continuare l'analisi dei moduli Fastify residui, privilegiando confini reali e
verificabili; non modificare readiness declarative o Flask legacy senza una
necessità di comportamento.
