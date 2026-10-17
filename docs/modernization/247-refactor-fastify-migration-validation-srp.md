# Tranche 247 — Storage migration validation

## Moduli separati

- `backend/src/storage-v2/migration/errors.ts`
  - errore di dominio condiviso della migrazione.
- `backend/src/storage-v2/migration/validation.ts`
  - validazione manifest e target versions;
  - caricamento del manifest verificato;
  - validazione delle radici disposable e dei riferimenti filesystem;
  - verifica dell'identità dello snapshot legacy.
- `backend/src/storage-v2/migration/executor.ts`
  - mantiene copia dati, mapping SQLite, promozione oggetti, journal e
    verifica finale;
  - continua a riesportare `MigrationError` per la CLI.

## Motivazione SRP

Le verifiche di input e sicurezza dei path erano mescolate all'esecuzione
mutante della migrazione. Il validator ora concentra il gate iniziale e viene
riutilizzato da migrate e verify, mentre l'executor resta responsabile delle
operazioni di trasferimento e checkpoint.

## Contratti preservati

- `MigrationError` continua a essere esportato dall'executor;
- CLI, autorizzazione disposable, manifest ABI e versioni target invariati;
- controlli source/target overlap, symlink, traversal e snapshot identity
  invariati;
- schema SQLite, journal, migrazione idempotente e dati operativi invariati.

## Test eseguiti

Con Node.js 24.20.0:

- test mirati migration/inventory — PASS, 17 test;
- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe lunghe sui nuovi moduli — PASS.

## Rischi residui

`migration/executor.ts` conserva le operazioni di copia, mapping e recovery,
che restano accoppiate al journal e alle transazioni target. Flask legacy non è
stato rifattorizzato, come richiesto.

## Commit creati

Da creare dopo la verifica finale della tranche:

- `refactor(fastify-migration): extract migration validation`

## Prossima tranche

Proseguire con il workflow canonico storage-v2 o con un altro modulo backend
solo quando il confine sia indipendente e verificabile.
