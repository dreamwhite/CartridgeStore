# Tranche 261 — Fastify configuration network policy

## Moduli separati

- `backend/src/config/env-network.ts`
- `backend/src/config/env.ts`

## Motivazione SRP

La policy di rete del backend gestisce due responsabilità correlate ma
indipendenti dal resto del loader: fiducia nei proxy e configurazione mDNS.
Il resolver dedicato raccoglie i valori, applica i limiti e restituisce il
contratto già usato da `BackendConfig`.

## Contratti preservati

- Nessun endpoint, response shape, schema SQLite o contratto firmware è stato
  modificato.
- Sono invariati variabili d'ambiente, default, limiti e valori di ritorno.
- Sono invariati i controlli su hop proxy, CIDR trusted, produzione, interfaccia
  mDNS e messaggi di errore.
- `env.ts` continua a comporre lo stesso `BackendConfig` pubblico.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

Il loader mantiene ancora la composizione delle soglie multiplayer, HTTP,
SAML, submission, metriche, score e backup. Saranno estratte solo quando il
confine di dominio sarà indipendente e non cambierà la precedenza delle
validazioni.

## Commit creato

- `refactor(fastify-config): extract network policy`

## Prossima tranche

Analizzare le soglie HTTP e autenticazione, verificando se possono essere
separate in un resolver comune senza fondere domini diversi.
