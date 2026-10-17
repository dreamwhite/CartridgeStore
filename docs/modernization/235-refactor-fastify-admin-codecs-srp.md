# Fastify admin codecs SRP refactor

## Moduli separati

- `backend/src/admin/errors.ts` contiene l'errore pubblico del confine
  amministrativo.
- `backend/src/admin/codecs.ts` contiene normalizzazione di identificativi,
  username, email, ruoli e gruppi, oltre ai decoder per gruppi e audit.
- `backend/src/admin/service.ts` mantiene transazioni SQLite, audit, vincoli
  sull'ultimo amministratore e mutazioni dell'identità.

## Motivazione SRP

Il servizio amministrativo mescolava validazione input, conversione delle
proiezioni JSON e gestione transazionale di utenti e gruppi. Le trasformazioni
senza stato sono ora isolate, mentre le decisioni che richiedono database,
audit e autorizzazioni restano nel servizio.

## Contratti preservati

- Endpoint, response shape, codici errore e status code invariati.
- Regole su ruolo, gruppi, ultimo amministratore, revoche e audit invariate.
- `AdminError` continua a essere importabile da `admin/service.ts` tramite
  re-export di compatibilità.
- Nessuna modifica a database, autenticazione, sicurezza o contratti firmware.

## Test eseguiti

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sui nuovi moduli — PASS

## Rischi residui

Il servizio admin resta responsabile delle transazioni e dei vincoli di
integrità tra utenti, gruppi, token e audit; ulteriori separazioni dovranno
preservare queste unità atomiche.

## Commit creato

- `refactor(fastify-admin): extract administrative codecs`

## Prossima tranche

Continuare l'analisi dei servizi Fastify residui, con priorità ai moduli che
contengono confini puri di conversione o validazione già riconoscibili.
