# Tranche 197 — Fastify canonical backup contracts

## Moduli separati

- `backend/src/storage-v2/backup-contracts.ts` contiene ABI, autorizzazioni,
  limiti, opzioni, manifest e risultati del backup canonical.
- `backend/src/storage-v2/backup.ts` conserva la logica di snapshot, archivio,
  verifica, restore e i relativi helper privati.

## Motivazione SRP

Il modulo di backup conteneva sia il contratto persistito del formato sia
l'orchestrazione filesystem/SQLite. Il contratto è ora isolato e documentato;
la logica operativa resta insieme perché condivide limiti, staging, verifica e
transizioni di restore.

## Contratti preservati

- `backup.ts` resta il barrel pubblico con gli stessi export di costanti, tipi,
  `verifyCanonicalBackup`, `restoreCanonicalBackup` e
  `assertRestoreTargetNotReady`.
- ABI, autorizzazioni, limiti predefiniti, manifest, schema SQLite e stati di
  recovery non sono cambiati.
- Nessun endpoint, database, autenticazione, sicurezza o dato operativo è
  stato modificato.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS

## Rischi residui

`backup.ts` resta grande perché il formato ZIP streaming e il restore
transazionale condividono invarianti di sicurezza. `backup-v4.ts` è il
prossimo candidato, con particolare attenzione alle chiavi e ai confini di
cifratura.

## Commit creati

- `refactor(fastify-backup): extract canonical backup contracts`

## Prossima tranche

Analizzare `backend/src/storage-v2/backup-v4.ts` per separare contratti e
primitive di cifratura senza alterare il formato v4 o la gestione delle chiavi.
