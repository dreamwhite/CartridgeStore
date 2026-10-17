# Tranche 307 — Fastify encrypted backup decryption

## Moduli separati

- `backend/src/storage-v2/backup-v4-decryption.ts`
- `backend/src/storage-v2/backup-v4.ts`

## Motivazione SRP

`backup-v4.ts` coordinava creazione dell’envelope, retention, restore e anche
la decrittazione streaming del payload. La decrittazione AES-GCM, verifica
dell’hash e controllo dei metadati del payload canonico sono stati estratti in
un modulo dedicato; il workflow pubblico conserva l’orchestrazione e il
barrel compatibility.

## Contratti preservati

- Restano invariati ABI, header autenticato, nonce/tag, limiti e fault points.
- Restano invariati gli errori per truncation, autenticazione, integrità e
  mismatch dei metadati.
- Restano invariati key provider, autorizzazioni, marker, retention e restore.
- Non sono cambiate API pubbliche, schema SQLite o contratti firmware.
- Flask legacy è stato lasciato fuori dall’intervento come richiesto.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- controllo righe lunghe del nuovo modulo — PASS
- `git diff --check` — PASS

## Rischi residui

`backup-v4.ts` mantiene creazione dell’envelope, marker, retention e
coordinamento restore; ulteriori estrazioni richiederebbero valutazione sui
confini di autenticità e compatibilità del formato.

## Commit

- `refactor(fastify-storage): extract backup v4 decryption`

## Prossima tranche

Continuare l’analisi dei moduli backend ancora grandi e dei componenti
frontend, senza modificare i contratti operativi.
