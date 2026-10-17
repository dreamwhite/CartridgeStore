# Tranche 202 — Fastify setup service contracts

## Moduli separati

- `backend/src/setup/service-contracts.ts` contiene stati, step, sessione e
  dipendenze del servizio di prima installazione.
- `backend/src/setup/service.ts` mantiene autorizzazione, transazioni dello
  stato, mutazioni settings/federation, validazioni e completamento.

## Motivazione SRP

Il servizio mescolava il contratto della procedura di setup con le mutazioni
di installazione e le verifiche provider. I contratti sono ora separati; la
logica resta nell'orchestratore perché condivide sessione, stato SQLite,
audit e autorizzazione bootstrap.

## Contratti preservati

- `service.ts` resta il barrel pubblico per `SetupError`, `SetupService`,
  stati, step, sessione e opzioni.
- Sono invariati cookie, TTL, stati SQLite, ordine degli step, token bootstrap,
  policy mDNS, provider OIDC/SAML e response di setup.
- Nessun endpoint, autenticazione o dato operativo è stato modificato.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS

## Rischi residui

Le mutazioni di setup restano concentrate per preservare l'ordine e la
transazione dello stato di installazione. Le validazioni provider sono già
separate in `provider-validation.ts`.

## Commit creati

- `refactor(fastify-setup): extract setup service contracts`

## Prossima tranche

Analizzare `backend/src/backup/service.ts`, separando contratti e primitive
del formato dal coordinamento di restore e recovery.
