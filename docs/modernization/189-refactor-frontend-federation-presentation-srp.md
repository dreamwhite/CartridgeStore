# Refactor federation workspace presentation primitives

## Stato

Tranche completata con commit `refactor(frontend-ui): extract federation
presentation primitives`.

## Moduli separati

Da `frontend/src/components/federation/FederationWorkspace.tsx` sono stati
estratti in `frontend/src/components/federation/presentation.tsx` i primitivi
condivisi:

- `Panel` e `Notice` per layout e feedback;
- `Field` e `TextArea` per i form;
- `StatusBadge` per lo stato provider;
- `Endpoint` per gli endpoint canonici copiabili;
- `CertificatePanel` per la visualizzazione e sostituzione dei certificati.

`FederationWorkspace.tsx` continua a fornire gli entry point pubblici usati
dalle route (`FederationOverview`, `ProviderList`, `ProviderForm`,
`NewProvider`, `ProviderDetails`, `IdentityLinks`), quindi non sono stati
modificati import applicativi o routing.

## Motivazione SRP

Il workspace aggregava logica di query/mutation e sette componenti di
presentazione riusabili. L'estrazione riduce la responsabilità del modulo
principale e rende esplicito il confine tra composizione della pagina e UI
primitiva, senza creare hook o adapter prematuri.

## Contratti preservati

- Nessun endpoint, payload, autorizzazione, testo operativo o comportamento di
  conferma è stato cambiato.
- Le route continuano a importare gli stessi simboli dal compatibility module.
- Non sono stati modificati database, autenticazione, firmware contract o dati
  operativi.

## Verifiche

Eseguite con Node `24.20.0`:

- `pnpm --dir frontend run typecheck` — PASS;
- `pnpm --dir frontend run lint` — PASS;
- `pnpm --dir frontend run test` — PASS, 50 file e 113 test;
- `pnpm --dir frontend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe oltre 100 caratteri nel nuovo modulo — nessuna violazione.

## Rischi residui

`FederationWorkspace.tsx` contiene ancora i componenti feature provider,
details e identity. La loro estrazione richiede una tranche dedicata perché
condividono stato sensibile, query client e callback di reautenticazione.
Restano inoltre da analizzare `SetupPage` e i workflow workspace.

## Commit creati

- `refactor(frontend-ui): extract federation presentation primitives`

## Prossima tranche

Valutare l'estrazione dei componenti feature federation oppure passare a
`SetupPage`, scegliendo il confine che consenta test focalizzati senza alterare
il comportamento del wizard.
