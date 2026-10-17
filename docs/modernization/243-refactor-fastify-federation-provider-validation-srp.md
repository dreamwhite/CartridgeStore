# Tranche 243 — Federation provider validation

## Moduli separati

- `backend/src/federation/provider-validation.ts`
  - normalizzazione degli identificativi e degli URL;
  - validazione dei riferimenti secret-scoped;
  - validazione OIDC/SAML, certificati, scope e clock skew;
  - costruzione della configurazione normalizzata.
- `backend/src/federation/provider.ts`
  - conserva transazioni SQLite, audit, lifecycle e lookup dei provider;
  - delega la normalizzazione pura al modulo di validazione.

## Motivazione SRP

La validazione degli input federation era mescolata alle responsabilità di
persistenza e lifecycle del servizio. Il nuovo modulo è puro rispetto al
database e concentra le regole OIDC/SAML, rendendo esplicito il confine tra
input validation e provider persistence.

## Contratti preservati

- `FederationProviderService` e `normalizeForProvisioning` invariati;
- errori, codici HTTP, messaggi e default invariati;
- regole HTTPS, riferimenti secret-scoped, certificati SAML e duplicate scope
  invariati;
- schema SQLite, audit, autorizzazioni, route e contratti firmware invariati.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe lunghe sul nuovo modulo — PASS.

## Rischi residui

Il servizio federation conserva le transazioni e le regole di lifecycle che
dipendono dal database. Non sono state introdotte modifiche ai flussi di
provisioning o alle autorizzazioni.

Il refactor Flask legacy è escluso su decisione del progetto perché il codice
è transitorio e destinato alla rimozione.

## Commit creati

Da creare dopo la verifica finale della tranche:

- `refactor(fastify-federation): extract provider validation`

## Prossima tranche

Continuare con un altro confine backend indipendente, oppure fermarsi quando
le responsabilità residue non sono separabili senza cambiare comportamento.
