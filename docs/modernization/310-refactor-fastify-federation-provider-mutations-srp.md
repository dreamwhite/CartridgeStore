# Tranche 310 — federation provider mutations

## Moduli separati

- `backend/src/federation/provider-mutations.ts`
  - creazione e provisioning idempotente dei provider;
  - aggiornamento dei dati OIDC/SAML;
  - attivazione/disattivazione e invalidazione delle transazioni;
  - incremento della generazione di sicurezza;
  - audit delle mutazioni e gestione dei conflitti SQLite.
- `backend/src/federation/provider.ts`
  - mantiene la facciata `FederationProviderService`;
  - delega le mutazioni al nuovo servizio;
  - conserva letture, conteggi e proiezioni pubbliche.

## Motivazione SRP

Il servizio federation aggregava nello stesso modulo transazioni di scrittura,
normalizzazione, audit e letture dei provider. Il confine estratto separa la
responsabilità mutazionale da quella di accesso alle proiezioni e mantiene la
facciata esistente per tutti i consumer interni.

## Contratti preservati

- Nessun endpoint, response shape, schema SQLite o autorizzazione è cambiato.
- Sono preservati provisioning idempotente, codici di errore, transazioni
  immediate, audit e invalidazione delle correlazioni federation.
- `FederationProviderService` conserva tutti i metodi e gli export pubblici
  precedenti.
- Non sono stati modificati segreti, dati operativi, contratti firmware o
  dipendenze.
- Flask legacy è escluso dal perimetro della refactorizzazione.

## Test eseguiti

Con Node `24.20.0`:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe lunghe sui moduli modificati — PASS

Durante la prima esecuzione è stata rilevata una query con un placeholder SQL
in più; è stata corretta ripristinando esattamente i 26 placeholder previsti
dalle 26 colonne esistenti. La suite completa è stata poi rieseguita con esito
positivo.

## Rischi residui

La facciata `FederationProviderService` conserva ancora alcune letture
specializzate e il conteggio delle transazioni pending. Separarle ulteriormente
non è necessario finché non emerge un consumer o un confine di dominio distinto
che lo richieda.

## Commit creati

- `f1ae972 refactor(fastify-federation): extract provider mutations`

## Prossima tranche

Continuare l'analisi dei servizi Fastify residui e intervenire solo su confini
SRP reali, mantenendo la suite completa dopo ogni dominio.
