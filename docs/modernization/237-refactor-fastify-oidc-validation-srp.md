# Fastify OIDC validation SRP refactor

## Moduli separati

- `backend/src/oidc/validation.ts` contiene errore OIDC, digest di binding,
  parsing degli origin, validazione endpoint discovery e controllo dei return
  path/query value.
- `backend/src/oidc/service.ts` mantiene cache discovery, transazioni OIDC,
  PKCE, token exchange, identity resolution, session rotation e audit.

## Motivazione SRP

Le regole pure di validazione URL, endpoint e valori di callback erano
mescolate all'orchestrazione del protocollo. Sono state isolate in un modulo
senza stato, lasciando nel servizio le operazioni che richiedono provider,
database, segreti, sessioni e transazioni.

## Contratti preservati

- Route OIDC, callback, PKCE, binding browser e response shape invariati.
- Codici, status code e messaggi di `OidcError` invariati.
- `OidcError` continua a essere importabile da `oidc/service.ts` tramite
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

La cache discovery e il flusso OIDC restano nello stesso servizio perché
condividono stato in-flight, provider configurato e gestione degli errori del
provider. Un'ulteriore divisione richiederebbe un contratto esplicito per la
cache e va valutata separatamente.

## Commit creato

- `refactor(fastify-oidc): extract protocol validation`

## Prossima tranche

Analizzare il servizio SAML o i moduli storage ancora grandi, mantenendo la
stessa soglia: estrarre solo confini puri o adapter già indipendenti.
