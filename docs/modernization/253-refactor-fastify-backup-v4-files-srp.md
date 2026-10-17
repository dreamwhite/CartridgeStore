# Tranche 253 — Encrypted backup envelope adapter

## Moduli separati

- `backend/src/storage-v2/backup-v4-files.ts`
  - path e regular-file validation;
  - envelope header parsing and byte-offset checks;
  - authenticated streaming encryption and archive hashing.
- `backend/src/storage-v2/backup-v4.ts`
  - mantiene key registry, decrypt/verify orchestration, restore e retention;
  - delega il file I/O dell'envelope all'adapter.

## Motivazione SRP

Il modulo v4 combinava gestione delle chiavi, retention e orchestrazione del
restore con il formato fisico dell'envelope cifrato. Il nuovo adapter concentra
magic, header, ciphertext, tag, fsync e fault points senza inglobare le policy
di chiavi o il workflow di restore.

## Contratti preservati

- magic bytes, header JSON, AAD, AES-GCM, nonce/tag e chunk size invariati;
- errori di formato, truncation, limiti e completion marker invariati;
- fault points di cifratura invariati;
- key registry, retention, restore, SQLite, endpoint e firmware invariati.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe lunghe sul nuovo adapter — PASS.

## Rischi residui

La verifica/decrittazione del payload e la retention restano nel servizio v4
perché coordinano envelope, backup canonico e target filesystem.

## Commit creati

- `refactor(fastify-backup): extract encrypted envelope adapter`

## Prossima tranche

Rivedere i restanti servizi Fastify voluminosi, privilegiando confini di
serializzazione o adapter I/O già isolabili e rinviando i monoliti di policy
che richiederebbero cambi di comportamento.
