# Tranche 198 — Fastify encrypted backup v4 contracts

## Moduli separati

- `backend/src/storage-v2/backup-v4-contracts.ts` contiene ABI, autorizzazioni,
  chiavi, header, limiti, opzioni, risultati e retention del formato v4.
- `backend/src/storage-v2/backup-v4.ts` mantiene provider di chiavi, rotazione,
  cifratura AES-GCM, envelope streaming, verifica, restore e retention.

## Motivazione SRP

Il modulo v4 accoppiava il contratto dell'envelope con primitive crittografiche
e gestione dello stream. Il contratto pubblico è ora isolato; le operazioni
restano nel modulo perché condividono autenticazione dell'header, nonce, tag,
provider di chiavi e cleanup temporaneo.

## Contratti preservati

- `backup-v4.ts` resta il barrel pubblico con gli stessi export di costanti,
  tipi, provider e funzioni operative.
- ABI v4, autorizzazioni, header AES-256-GCM, key wrapping, retention e
  compatibilità con il payload v3 non sono cambiati.
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

La parte crittografica e lo streaming restano concentrati per mantenere
verificabili insieme autenticazione, integrità e cleanup. Un'ulteriore
separazione richiederebbe test mirati sul formato binario e non è necessaria
per questa tranche.

## Commit creati

- `refactor(fastify-backup): extract encrypted backup contracts`

## Prossima tranche

Analizzare `backend/src/storage-v2/workflow.ts`, separando contratti e helper
di normalizzazione dal workflow transazionale di review/pubblicazione.
