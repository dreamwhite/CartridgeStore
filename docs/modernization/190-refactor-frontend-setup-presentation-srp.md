# Refactor setup page presentation boundaries

## Stato

Tranche completata con commit `refactor(frontend-ui): extract setup form
presentation`.

## Moduli separati

Da `frontend/src/app/setup/page.tsx` sono stati estratti:

- `frontend/src/components/setup/setup-steps.ts`: metadata e ordine degli
  step del wizard;
- `frontend/src/components/setup/SetupField.tsx`: renderer condiviso dei campi
  stringa, password, numerici e checkbox.

La pagina mantiene direttamente il caricamento dello stato, la macchina di
avanzamento, la costruzione dei payload e le azioni authorize/save/skip/finish.

## Motivazione SRP

La configurazione visuale degli step e il rendering dei campi erano dettagli
presentazionali incorporati nella pagina applicativa. La loro estrazione riduce
la superficie del page component senza introdurre uno store o un hook prematuro
e prepara una successiva separazione della form state logic.

## Contratti preservati

- Nessun endpoint, metodo HTTP, payload, schema, redirect o comportamento del
  wizard è stato cambiato.
- L'ordine degli step, le etichette e l'indicazione optional sono invariati.
- Il barrel API setup e tutti i contratti backend restano invariati.
- Non sono stati modificati autenticazione, database, firmware contract o dati
  operativi.

## Verifiche

Eseguite con Node `24.20.0`:

- `pnpm --dir frontend run typecheck` — PASS;
- `pnpm --dir frontend run lint` — PASS;
- `pnpm --dir frontend run test` — PASS, 50 file e 113 test;
- `pnpm --dir frontend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe oltre 100 caratteri sui nuovi moduli — nessuna violazione.

## Rischi residui

`SetupPage` contiene ancora stato locale e rendering dei payload per ogni step.
La separazione richiede test focalizzati sul wizard prima di estrarre hook o
componenti per singolo step.

## Commit creati

- `refactor(frontend-ui): extract setup form presentation`

## Prossima tranche

Analizzare `AccountWorkspace`, `AdminWorkspace` e i workflow workspace per
stabilire quali sono già composition root sottili e quali richiedono davvero
estrazioni di hook, query adapter o layout.
