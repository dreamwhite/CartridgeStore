# Tranche 195 — Fastify environment value parsers

## Moduli separati

- `backend/src/config/env-values.ts` contiene i parser e validatori primitivi
  usati dalla configurazione backend.
- `backend/src/config/env.ts` mantiene `BackendConfig` e `loadConfig` come
  confine pubblico della configurazione.

## Motivazione SRP

La costruzione della configurazione e la validazione dei singoli valori erano
concentrate nello stesso modulo. L'estrazione separa i parser riutilizzabili
(`positiveInteger`, `booleanValue`, `proxyCidrs` e gli altri) dal caricamento
della configurazione completa, senza introdurre un nuovo livello applicativo.

## Contratti preservati

- Gli export pubblici di `env.ts` restano `BackendConfig` e `loadConfig`.
- Sono invariati nomi delle variabili d'ambiente, valori di fallback, messaggi
  di errore e validazione dei CIDR, dei secret e degli URI SQLite.
- Non sono cambiati database, API, autenticazione, sicurezza o dati operativi.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS

## Rischi residui

Nessun rischio funzionale rilevato dalla suite. I moduli di consistenza della
pubblicazione restano il principale confine SRP da analizzare nella prossima
tranche Fastify.

## Commit creati

- `refactor(fastify-config): extract environment value parsers`

## Prossima tranche

Analizzare `backend/src/consistency/publication.ts`, separando soltanto
contratti e responsabilità pure con confini reali e mantenendo il barrel
pubblico compatibile.
