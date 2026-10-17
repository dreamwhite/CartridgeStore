# Fastify encrypted backup-v4 codecs SRP refactor

## Moduli separati

- `backend/src/storage-v2/backup-v4-codecs.ts` contiene serializzazione
  canonica, limiti, autorizzazione, decoding base64url, validazione chiavi,
  wrapping AES-GCM e parsing dell'header autenticato.
- `backend/src/storage-v2/backup-v4.ts` mantiene filesystem envelope,
  streaming cifrato, snapshot canonical, restore, verifica e retention.

## Motivazione SRP

Il modulo backup-v4 mescolava codec/header e gestione di file temporanei,
streaming, fault injection e restore. I confini di formato e crittografia
sono ora isolati in un modulo dedicato; le operazioni con effetti filesystem
restano nell'orchestratore.

## Contratti preservati

- ABI, versione, header, cifratura AES-GCM, key wrapping e marker invariati.
- Autorizzazioni, limiti, fault points, archive format e restore invariati.
- Nessuna modifica a database, autenticazione, sicurezza o contratti firmware.

## Test eseguiti

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

Il modulo principale mantiene molte responsabilità operative perché backup,
verifica e restore condividono fault points, quarantena e marker. Ulteriori
estrazioni dovranno preservare l'ordine delle transizioni filesystem.

## Commit creato

- `refactor(fastify-backup): extract encrypted envelope codecs`

## Prossima tranche

Valutare consistenza/publication e workflow storage per ulteriori codec o
adapter puri; evitare di frammentare le transazioni operative.
