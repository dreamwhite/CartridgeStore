# Tranche 200 — Fastify federation provider contracts

## Moduli separati

- `backend/src/federation/provider-contracts.ts` contiene protocolli, metodi
  OIDC, scopi dei secret, configurazione normalizzata, input e contesto audit.
- `backend/src/federation/provider.ts` mantiene validazione, normalizzazione,
  persistenza SQLite, audit e gestione del ciclo di vita del provider.

## Motivazione SRP

Il modulo provider mescolava il contratto pubblico con la validazione OIDC/SAML
e le mutazioni persistenti. I tipi e le interfacce sono ora indipendenti dalla
persistenza; le regole di normalizzazione restano vicine al servizio perché
sono il confine di sicurezza comune ai due protocolli.

## Contratti preservati

- `provider.ts` resta il barrel pubblico per tipi, `FederationProviderError` e
  `FederationProviderService`.
- Sono invariati riferimenti ai secret, validazione URL/certificati, policy
  SAML, generazioni, audit, schema SQLite e autorizzazioni.
- Nessun endpoint, response, autenticazione o dato operativo è stato cambiato.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS

## Rischi residui

La normalizzazione resta un punto comune tra OIDC e SAML e non è stata
frammentata ulteriormente per evitare divergenze nelle regole di sicurezza.

## Commit creati

- `refactor(fastify-federation): extract provider contracts`

## Prossima tranche

Analizzare `backend/src/admin/service.ts` per separare contratti, letture,
mutazioni e invalidazione delle credenziali senza cambiare RBAC o audit.
