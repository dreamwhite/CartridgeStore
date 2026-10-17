# Tranche 262 — Fastify configuration multiplayer limits

## Moduli separati

- `backend/src/config/env-multiplayer.ts`
- `backend/src/config/env.ts`

## Motivazione SRP

Le soglie del relay multiplayer formano un dominio omogeneo: connessioni,
rate limit, heartbeat, timeout e buffer. Il resolver dedicato materializza
questi valori senza inglobare altre policy di autenticazione, storage o rete.

## Contratti preservati

- Nessun endpoint WebSocket, messaggio, response shape, schema SQLite o
  contratto firmware è stato modificato.
- Sono invariati i nomi delle variabili d'ambiente, i default e tutti i 19
  campi multiplayer di `BackendConfig`.
- Sono invariati i controlli effettuati da `positiveInteger`.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

La composizione di `BackendConfig` contiene ancora soglie per HTTP/auth,
SAML, submission, metriche, score e backup. Restano da estrarre per dominio,
con verifiche separate per non alterare default o precedenza delle policy.

## Commit creato

- `refactor(fastify-config): extract multiplayer limits`

## Prossima tranche

Analizzare le soglie HTTP e autenticazione, mantenendole separate se non
emerge una responsabilità condivisa reale.
