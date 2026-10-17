# Tranche 292 — Fastify storage object verification

## Moduli separati

- `backend/src/storage-v2/object-verification.ts`
- `backend/src/storage-v2/objects.ts`

## Motivazione SRP

`ObjectStore` e `ReadonlyObjectStore` duplicavano la scansione del file,
calcolo SHA-256, confronto delle dimensioni e mappatura degli errori. La
verifica read-only è stata estratta in `verifyStorageObject`; i due store
mantengono i rispettivi capability boundary e risolutori di path.

## Contratti preservati

- Restano invariati risultati `ok`, codici di verifica, hash, dimensioni e
  chiusura dei file descriptor.
- Il writer conserva il messaggio `storage object row is missing` quando manca
  la riga SQLite.
- Non sono cambiati schema SQLite, API pubbliche, autorizzazioni o contratti
  firmware.
- Flask legacy è stato lasciato intatto.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- controllo righe lunghe del nuovo modulo — PASS
- `git diff --check` — PASS

## Rischi residui

La risoluzione del path resta nel singolo store perché il writer e il reader
devono mantenere capability diverse. Il nuovo modulo esegue solo verifica e
non introduce accesso di scrittura.

## Commit

- `refactor(fastify-storage): extract object verification`

## Prossima tranche

Continuare l’analisi dei restanti moduli Fastify e frontend, evitando di
separare codice che rappresenta un’unica transazione o state machine.
