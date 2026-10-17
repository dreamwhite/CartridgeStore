# Tranche 196 — Fastify publication consistency

## Moduli separati

- `backend/src/consistency/publication-contracts.ts` contiene stati, tipi,
  opzioni e costanti del journal di pubblicazione.
- `backend/src/consistency/publication-codecs.ts` contiene validazione e
  trasformazione di metadata, cartridge, JSON del journal e hash.
- `backend/src/consistency/publication.ts` mantiene il servizio orchestratore
  per lock, staging, sostituzione, database, compensazione e riconciliazione.

## Motivazione SRP

Il servizio riuniva contratti persistiti, codec JSON/cartridge e workflow
filesystem/database. I contratti e le trasformazioni pure ora hanno confini
separati; il servizio conserva esclusivamente l'orchestrazione che richiede
stato, lock e accesso alle risorse.

## Contratti preservati

- `backend/src/consistency/publication.ts` resta il barrel pubblico per tutti
  gli export esistenti, inclusi `PublicationConsistencyService`, tipi,
  costanti e `applyReviewMetadata`.
- Sono invariati journal version, stati, hash, error code, percorsi, schema
  SQLite, API, autenticazione, sicurezza e comportamento di recovery.
- Non sono stati modificati dati operativi.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS

## Rischi residui

Il servizio resta intenzionalmente ampio perché coordina una transazione
filesystem/database e il relativo recupero. Le prossime estrazioni devono
preservare l'ordine delle transizioni e i fault point; non è stata introdotta
un'astrazione ulteriore senza un confine verificabile.

## Commit creati

- `refactor(fastify-consistency): split publication contracts and codecs`

## Prossima tranche

Analizzare `backend/src/storage-v2/backup.ts`, separando contratti, gestione
del formato e orchestrazione del backup solo dove i confini sono indipendenti.
