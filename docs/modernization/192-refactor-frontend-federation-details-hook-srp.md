# Refactor federation provider details adapter

## Stato

Tranche completata con commit `refactor(frontend-ui): extract federation
details query adapter`.

## Moduli separati

È stato creato:

- `frontend/src/components/federation/use-provider-details.ts`.

Il hook possiede le query provider/status, le mutation di update, enable/disable,
secret rotation, certificati e revoca transazioni, oltre a stato editing,
feedback, segreti sensibili, invalidazione cache e callback di reautenticazione.
`FederationWorkspace.tsx` mantiene il rendering e le route UI.

## Motivazione SRP

`ProviderDetails` combinava query React Query, cinque mutation, invalidazioni e
una pagina JSX molto densa. L’estrazione rende il confine query/mutation
esplicito senza cambiare la facade API o aggiungere un nuovo livello backend.

## Contratti preservati

- Query key provider, status e providers invariati;
- invalidazioni dopo update, stato, rotazione, certificati e revoca invariate;
- messaggi di successo, gestione segreti e reautenticazione invariati;
- nessuna modifica a endpoint, autorizzazioni, database o firmware contract.

## Verifiche

Eseguite con Node `24.20.0`:

- `pnpm --dir frontend run typecheck` — PASS;
- `pnpm --dir frontend run lint` — PASS;
- `pnpm --dir frontend run test` — PASS, 50 file e 113 test;
- `pnpm --dir frontend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe oltre 100 caratteri nel nuovo hook — nessuna violazione.

## Rischi residui

`IdentityLinks` mantiene ancora query, mutation e form state inline. È il
prossimo confine frontend federation da estrarre prima di considerare chiusa
questa area.

## Commit creati

- `refactor(frontend-ui): extract federation details query adapter`

## Prossima tranche

Estrarre `IdentityLinks` in un hook query/mutation e in componenti di
presentazione focalizzati, mantenendo invariati i query key e la conferma di
retirement.
