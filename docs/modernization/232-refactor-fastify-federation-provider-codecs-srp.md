# Fastify federation provider codec SRP tranche

## Moduli separati

- `backend/src/federation/provider-codecs.ts` contiene l’errore pubblico del
  dominio, normalizzazione del client authentication method, decoding delle
  righe SQLite e confronto dei provider provisioned.
- `backend/src/federation/provider.ts` conserva validazione completa,
  transazioni, mutazioni, audit e query del servizio.
- `provider.ts` riesporta `FederationProviderError` per compatibilità con
  OIDC, SAML, admin routes e test.

## Motivazione SRP

Le trasformazioni pure dei dati persistiti e il confronto idempotente del
provisioning sono responsabilità diverse dalle mutazioni transazionali del
provider service. Il confine riduce il servizio senza separare le invarianti
di sicurezza o le transazioni.

## Contratti preservati

- Nessun endpoint, response, schema SQLite, secret reference o regola di
  autorizzazione è cambiata.
- Sono invariati error class, codici/status, decoding legacy dei certificati e
  confronto dei campi provisioned.
- Nessun dato operativo o configurazione è stato modificato.

## Verifica

- Node.js `24.20.0` — PASS.
- `pnpm --dir backend run typecheck` — PASS.
- `pnpm --dir backend run lint` — PASS.
- `pnpm --dir backend run test` — PASS, 59 file e 295 test.
- `pnpm --dir backend run build` — PASS.
- `git diff --check` — PASS.
- Il nuovo modulo non contiene righe oltre 100 caratteri.

## Rischi residui

La validazione semantica completa resta nel service perché dipende da più
campi e dalla modalità di provisioning; ulteriori estrazioni dovranno evitare
di disperdere quelle invarianti.

## Commit

- `refactor(fastify-federation): extract provider codecs`

## Prossima tranche

Continuare l’audit dei residui Fastify, in particolare config loader e servizi
di setup/admin, mantenendo invariati contratti e autorizzazioni.
