# Tranche 277 — Fastify federation provider records

## Moduli separati

- `backend/src/federation/provider-records.ts`
- `backend/src/federation/provider.ts`

## Motivazione SRP

Il servizio federation provider conteneva anche il read model SQL per provider
completi e la proiezione pubblica. Le query, la normalizzazione dell'id e la
conversione delle righe sono state spostate in un adapter dedicato; le
mutazioni, le transazioni e le regole di provisioning restano nel servizio.

## Contratti preservati

- Sono invariati ordinamento, proiezioni, errori `unknown provider` e
  conversione dei valori SQLite in configurazioni pubbliche.
- Sono invariate validation, provisioning, mutazioni, generazioni di
  sicurezza, audit e autorizzazioni.
- Non sono stati modificati schema SQLite, endpoint federation o protocolli
  OIDC/SAML.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

Le mutazioni provider restano concentrate nel servizio perché condividono
transazioni, conflict handling e audit. Non è stato introdotto un repository
generico.

## Commit creato

- `refactor(fastify-federation): extract provider records`

## Prossima tranche

Analizzare `backend/src/admin/service.ts` e `backend/src/setup/service.ts` per
estrarre read model o adapter di dominio con confini analogamente verificabili.
