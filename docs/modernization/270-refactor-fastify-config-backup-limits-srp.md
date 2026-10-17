# Tranche 270 — Fastify configuration backup limits

## Moduli separati

- `backend/src/config/env-backup-limits.ts`
- `backend/src/config/env.ts`

## Motivazione SRP

I limiti degli archivi backup formano una policy autonoma di contenimento:
dimensione archivio, espansione, entry, manifest, path, profondità e rapporto
di compressione. Sono stati estratti senza fondere la policy con cifratura,
modalità backup o restore.

## Contratti preservati

- Nessun endpoint, response shape, schema SQLite o comportamento di backup e
  restore è stato modificato.
- Sono invariati variabili d'ambiente, default, ordine delle validazioni,
  messaggio del compression ratio e otto campi di `BackendConfig`.
- Restano invariati i controlli `positiveInteger` e la conversione numerica del
  rapporto di compressione.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

La configurazione `env.ts` mantiene ancora le policy composite di writer,
runtime candidate/operational e autorizzazioni canoniche, che non sono state
separate artificialmente.

## Commit creato

- `refactor(fastify-config): extract backup limits`

## Prossima tranche

Passare dall'analisi di `env.ts` ai moduli applicativi Fastify residui,
iniziando da un dominio con confini di responsabilità verificabili.
