# Refactor federation provider form state

## Stato

Tranche completata con commit `refactor(frontend-ui): extract federation form
state hook`.

## Moduli separati

Da `frontend/src/components/federation/FederationWorkspace.tsx` è stata
estratta la gestione del form provider in:

- `frontend/src/components/federation/use-provider-form.ts`.

Il hook ora possiede lo stato OIDC/SAML, la validazione locale, la costruzione
dei payload, gli URL canonici e il reset dei valori sensibili. Il componente
mantiene il rendering JSX, gli errori UI e le callback di pagina.

## Motivazione SRP

`ProviderForm` combinava oltre venti stati locali, regole di validazione e
rendering di due protocolli. L'estrazione rende il form state testabile e
separa il mutation adapter dalla presentazione senza creare un modello dati
nuovo.

## Contratti preservati

- Nessun endpoint o mutation adapter è stato cambiato.
- I payload OIDC e SAML, i campi immutabili in modifica, i messaggi di
  validazione e il reset di client secret/certificati sono invariati.
- Nessun comportamento di autorizzazione, autenticazione, database o firmware
  è stato modificato.

## Verifiche

Eseguite con Node `24.20.0`:

- `pnpm --dir frontend run typecheck` — PASS;
- `pnpm --dir frontend run lint` — PASS;
- `pnpm --dir frontend run test` — PASS, 50 file e 113 test;
- `pnpm --dir frontend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe oltre 100 caratteri nel nuovo hook — nessuna violazione.

## Rischi residui

`FederationWorkspace.tsx` contiene ancora la composizione delle feature
provider/details/identity e alcune mutation locali. La prossima estrazione
dovrà separare query/mutation adapter o componenti feature con test mirati.

## Commit creati

- `refactor(frontend-ui): extract federation form state hook`

## Prossima tranche

Analizzare i query/mutation blocchi di `ProviderList`, `ProviderDetails` e
`IdentityLinks`, senza modificare il facade API o la gestione di
reautenticazione.
