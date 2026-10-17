# Tranche 285 — Fastify setup provider steps

## Moduli separati

- `backend/src/setup/provider-step-handlers.ts`
- `backend/src/setup/service.ts`

## Motivazione SRP

`SetupService` gestiva sessione, stato persistito, configurazione generale e
mutazioni dei provider federati. Gli handler per gli step OIDC/SAML sono stati
estratti in `SetupProviderStepHandlers`; la facciata mantiene il coordinamento
della sessione e del marking degli step tramite callback esplicite.
La validazione dei metadata OIDC/SAML è stata spostata nello stesso boundary
di provider setup, senza cambiare le funzioni pubbliche del servizio.

## Contratti preservati

- `SetupService.saveStep`, `validateOidc` e `importSamlMetadata` mantengono le
  stesse firme e response.
- Sono invariati payload, redirect URI, secret reference, audit, stato SQLite,
  codici errore e autorizzazioni.
- Non sono cambiati endpoint, autenticazione o contratti firmware.
- Flask legacy è stato lasciato intatto.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- controllo righe lunghe del nuovo modulo — PASS
- `git diff --check` — PASS

## Rischi residui

`SetupService` conserva ancora la gestione della macchina a stati e dei
mutatori non federati, che sono strettamente legati alla transazione di setup.
Ulteriori estrazioni dovranno preservare l’ordine di commit e audit degli step.

## Commit

- `refactor(fastify-setup): extract provider step handlers`

## Prossima tranche

Analizzare i servizi Fastify rimanenti, in particolare i confini della
configurazione runtime e dei mutatori amministrativi, evitando estrazioni che
richiedano modifiche di comportamento.
