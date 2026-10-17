# Fastify SAML validation SRP refactor

## Moduli separati

- `backend/src/saml/validation.ts` contiene `SamlError`, il formato name-id
  persistente, digest e validatori puri per valori bounded, return path e
  certificati.
- `backend/src/saml/service.ts` mantiene parsing XML, Node-SAML, cache
  transazionale, identity resolution, session rotation e audit.

## Motivazione SRP

Le regole pure di sicurezza e validazione dei dati SAML erano distribuite nel
servizio insieme all'orchestrazione del protocollo. Sono ora in un modulo
dedicato; le operazioni che coordinano XML, transaction store, segreti e
sessioni restano nel servizio.

## Contratti preservati

- Endpoint SAML, metadata, ACS, RelayState e response shape invariati.
- Certificati, name-id, recipient, binding, digest e codici errore invariati.
- `SamlError` continua a essere importabile da `saml/service.ts` tramite
  re-export.
- Nessuna modifica a sicurezza, autenticazione, database o contratti firmware.

## Test eseguiti

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

Il servizio SAML resta un orchestratore complesso per la dipendenza tra
validazione Node-SAML, transaction consume e replay protection. Non sono state
separate queste fasi per non alterare l'unità di sicurezza.

## Commit creato

- `refactor(fastify-saml): extract protocol validation`

## Prossima tranche

Concludere l'analisi dei moduli Fastify residui, in particolare storage e
consistenza, oppure passare alla validazione globale quando non restano confini
SRP sicuri da estrarre.
