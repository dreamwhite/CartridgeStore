# Fastify setup codecs SRP refactor

## Moduli separati

- `backend/src/setup/errors.ts` contiene l'errore pubblico del confine di
  installazione.
- `backend/src/setup/codecs.ts` contiene la validazione dei valori e dei
  payload setup, la decodifica dei passi persistiti e la proiezione sicura dei
  provider nel progresso.
- `backend/src/setup/service.ts` mantiene l'orchestrazione delle sessioni,
  delle transazioni SQLite, delle impostazioni e dei provider.

## Motivazione SRP

La validazione dei payload e la serializzazione sicura dei provider erano
funzioni pure mescolate alla gestione delle sessioni e alle transazioni del
servizio. Sono state spostate in un modulo senza stato, lasciando nel servizio
solo il coordinamento del workflow e mantenendo un confine esplicito per gli
errori pubblici.

## Contratti preservati

- Nessun endpoint, metodo HTTP o response shape è cambiato.
- I codici, gli status code e i messaggi di `SetupError` sono invariati.
- La compatibilità di import da `setup/service.ts` è mantenuta tramite
  re-export.
- Non sono stati modificati database, autenticazione, sicurezza o contratti
  firmware.

## Test eseguiti

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sui nuovi moduli — PASS

## Rischi residui

Il servizio setup resta un orchestratore ampio perché coordina stato durevole,
sessioni, provider, impostazioni e audit. Le ulteriori estrazioni dovranno
essere valutate per dominio e non devono introdurre transazioni distribuite o
duplicare le regole di autorizzazione.

## Commit creato

- `refactor(fastify-setup): extract setup codecs`

## Prossima tranche

Analizzare i residui Fastify più grandi, partendo dai moduli di configurazione,
consistenza, storage e servizi applicativi, estraendo solo confini con
responsabilità indipendenti e verificabili.
