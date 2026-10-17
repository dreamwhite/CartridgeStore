# Tranche 250 — Publication catalog index boundary

## Moduli separati

- `backend/src/consistency/publication-index.ts`
  - caricamento e validazione dell'indice catalogo;
  - limite dimensionale e digest dell'indice;
  - proiezione dell'indice per pubblicazione, aggiornamento e cancellazione.
- `backend/src/consistency/publication.ts`
  - mantiene lock, journal, filesystem staging/backup e transizioni;
  - delega la proiezione dell'indice al modulo catalog boundary.

## Motivazione SRP

La costruzione dell'indice pubblico era mescolata alle operazioni di
consistenza, backup e recovery. Il nuovo modulo concentra la trasformazione
del catalogo e la verifica dell'indice, mentre il servizio mantiene il
protocollo transazionale e il journal.

## Contratti preservati

- ABI dell'indice, forma dei giochi/versioni/architetture e digest invariati;
- errori di indice malformato, ABI non supportato e catalogo inconsistente
  invariati;
- limite di 16 MiB per indice persistito e staged invariato;
- lock, journal, file `.prg32`, SQLite, endpoint e autorizzazioni invariati;
- nessuna modifica ai contratti firmware o ai dati operativi.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe lunghe sul nuovo modulo — PASS.

## Rischi residui

La preparazione delle varianti continua a usare filesystem e dati di review
perché deve restare coordinata con la creazione del journal. Non sono emersi
contratti che richiedano modifiche.

## Commit creati

- `refactor(fastify-consistency): extract publication index boundary`

## Prossima tranche

Analizzare il modulo di consistenza per un eventuale confine separato di
planning o di operazioni filesystem, senza alterare l'ordine delle transizioni.
