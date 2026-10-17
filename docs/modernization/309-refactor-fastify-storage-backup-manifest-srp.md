# Tranche 309 — canonical backup manifest handling

## Moduli separati

- `backend/src/storage-v2/backup-manifest.ts`
  - serializzazione del payload del manifest;
  - validazione e composizione dei limiti del backup;
  - conversione dei limiti nella configurazione dello scanner ZIP;
  - normalizzazione sicura dei percorsi;
  - lettura, validazione della versione e verifica dell'hash del manifest.
- `backend/src/storage-v2/backup-verification.ts`
  - verifica dell'archivio canonical;
  - confronto tra inventario, SQLite e filesystem;
  - audit del contenuto ripristinato in un'area temporanea.
- `backend/src/storage-v2/backup.ts`
  - continua a esporre l'API pubblica esistente;
  - usa il nuovo modulo manifest per la serializzazione condivisa.

## Motivazione SRP

La verifica dell'archivio conteneva anche responsabilità indipendenti di
parsing del manifest, gestione dei limiti, conversione della configurazione e
normalizzazione dei percorsi. Queste responsabilità sono state estratte in un
modulo focalizzato, lasciando alla verifica il controllo dell'integrità
cross-file e cross-database.

## Contratti preservati

- Nessun endpoint, response shape, schema SQLite o autorizzazione è cambiato.
- Sono preservati ABI, versione, hash canonico, limiti e codici di errore del
  backup.
- La funzione pubblica `verifyCanonicalBackup` continua a essere disponibile
  tramite il modulo storage esistente.
- Non sono stati modificati contratti firmware o dati operativi.
- Flask legacy è escluso dal perimetro di questa refactorizzazione.

## Test eseguiti

Con Node `24.20.0`:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe lunghe sui nuovi moduli — PASS

## Rischi residui

Il modulo `backup.ts` contiene ancora responsabilità di orchestrazione della
creazione e del restore canonical. Sono confini distinti da analizzare in una
tranche successiva solo se l'estrazione può mantenere invariati i confini
transazionali e i percorsi di compensazione.

## Commit creati

- `151ae36 refactor(fastify-storage): extract backup manifest handling`

## Prossima tranche

Continuare l'analisi dei moduli Fastify residui e intervenire solo sui confini
SRP reali, mantenendo la validazione completa dopo ogni dominio.
