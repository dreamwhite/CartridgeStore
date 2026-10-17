# Tranche 259 — Fastify configuration public origins

## Moduli separati

- `backend/src/config/env-origins.ts`
- `backend/src/config/env.ts`

## Motivazione SRP

La configurazione delle origin pubbliche e della CORS allowlist ha una policy
autonoma: legge gli endpoint pubblici OIDC, federation e frontend, normalizza
la lista CORS e applica i vincoli su URL, HTTPS, modalità test e produzione.
Questa responsabilità è stata separata dal loader generale, mantenendo in
`env.ts` la composizione del contratto `BackendConfig`.

## Contratti preservati

- Nessun endpoint, response shape, schema SQLite o autorizzazione è stato
  modificato.
- Sono invariati i nomi delle variabili d'ambiente, il fallback della origin
  federation verso quella OIDC e la normalizzazione CORS.
- Sono invariati i controlli su URL, credenziali, path, query, fragment,
  HTTPS, modalità test e allowlist CORS in produzione.
- Sono invariati i messaggi di errore e i valori esposti da `BackendConfig`.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

`env.ts` contiene ancora la composizione di molte soglie e policy di runtime.
La tranche non modifica la loro semantica e non introduce un nuovo contratto
pubblico per la configurazione.

## Commit creato

- `refactor(fastify-config): extract public origin policy`

## Prossima tranche

Analizzare la policy dei cookie di sessione e le soglie HTTP/auth solo se il
confine resta indipendente e verificabile senza modificare il contratto di
`BackendConfig`.
