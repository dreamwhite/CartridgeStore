# Tranche 293 — Fastify backup archive SRP

## Moduli separati

- `backend/src/backup/archive/zip.ts`
- `backend/src/backup/archive/encryption.ts`
- `backend/src/backup/archive.ts`

## Motivazione SRP

`backup/archive.ts` gestiva contemporaneamente parsing e validazione del
central directory ZIP, estrazione e creazione degli archivi, oltre alla
cifratura AES-GCM e alla derivazione delle chiavi scrypt. Le responsabilità
sono state separate in un modulo ZIP e in un modulo di cifratura. Il file
originario resta un barrel di compatibilità per gli import esistenti.

## Contratti preservati

- Restano invariati i simboli pubblici `scanZipArchive`, `extractZipArchive`,
  `createZip`, `encryptBackup`, `decryptBackup`, `ZipEntryRecord` e
  `ExtractedArchive`.
- Non sono cambiati formato ZIP, formato dell’header cifrato, cifratura
  AES-256-GCM, KDF scrypt, limiti di sicurezza, messaggi o codici `BackupError`.
- Non sono cambiati endpoint, schema SQLite, autenticazione o contratti
  firmware.
- Flask legacy è stato lasciato fuori dall’intervento.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- controllo righe lunghe dei nuovi moduli — PASS
- `git diff --check` — PASS

## Rischi residui

La compatibilità dipende dal barrel `backend/src/backup/archive.ts`, che deve
restare il punto di import per i chiamanti legacy. I test esistenti coprono
creazione, cifratura, decrittazione, estrazione e validazione degli archivi.

## Commit

- `refactor(fastify-backup): split archive zip and encryption`

## Prossima tranche

Continuare l’analisi dei moduli Fastify ancora aggregati, scegliendo solo
confini che non attraversano una singola transazione o state machine.
