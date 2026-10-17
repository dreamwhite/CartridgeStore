# Fastify settings assets SRP refactor

## Moduli separati

- `backend/src/settings/assets.ts` contiene il dominio degli asset gestiti:
  tipo asset, limite dimensionale, rilevamento MIME e controllo dei nomi sicuri.
- `backend/src/settings/service.ts` mantiene la persistenza SQLite, la
  pubblicazione atomica dei file, la configurazione SMTP e la compatibilità
  dei percorsi legacy.

## Motivazione SRP

Il servizio settings incorporava la scansione dei magic bytes e le regole dei
nomi file insieme a transazioni SQLite e pubblicazione filesystem. Queste
regole pure sono ora isolate in un modulo senza stato; il servizio conserva il
coordinamento delle operazioni che richiedono rollback e audit.

## Contratti preservati

- Endpoint, response shape e URL `/api/assets` invariati.
- Formati accettati e limiti degli asset invariati.
- Compatibilità con i percorsi legacy `/static/custom` invariata.
- Nessuna modifica a database, autenticazione, sicurezza o contratti firmware.

## Test eseguiti

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

La pubblicazione degli asset resta volutamente nel servizio perché deve
coordinare file, transazione SQLite, fault injection e cleanup compensativo.

## Commit creato

- `refactor(fastify-settings): extract asset codecs`

## Prossima tranche

Analizzare i servizi Fastify residui e i moduli storage, privilegiando confini
di serializzazione, validazione o filesystem già indipendenti dall'orchestrazione.
