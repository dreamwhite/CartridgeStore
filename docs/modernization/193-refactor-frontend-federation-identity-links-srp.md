# Refactor federation identity links adapter

## Stato

Tranche completata con commit `refactor(frontend-ui): extract federation
identity links adapter`.

## Moduli separati

È stato creato:

- `frontend/src/components/federation/use-identity-links.ts`.

Il hook possiede le query identity/provider, il form state, le mutation di link
e retirement e le invalidazioni React Query. `IdentityLinks` mantiene la
presentazione, la conferma esplicita del retirement e la reautenticazione.

## Motivazione SRP

Il componente aggregava dati remoti, stato del form e rendering tabellare. La
separazione lascia al componente il solo coordinamento UI e rende il confine
query/mutation riusabile e verificabile.

## Contratti preservati

- Query key identity e provider invariati;
- payload del link, conversione numerica di `user_id` e reset di subject/user
  invariati;
- invalidazione dopo link e retirement invariata;
- conferma, autorizzazione e messaggi UI invariati;
- nessuna modifica a endpoint, database o firmware contract.

## Verifiche

Eseguite con Node `24.20.0`:

- `pnpm --dir frontend run typecheck` — PASS;
- `pnpm --dir frontend run lint` — PASS;
- `pnpm --dir frontend run test` — PASS, 50 file e 113 test;
- `pnpm --dir frontend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe oltre 100 caratteri nel nuovo hook — nessuna violazione.

## Rischi residui

L’area federation mantiene ancora la composizione densa dei componenti provider
e identity, ma query/mutation e form state principali sono separati. Restano da
valutare eventuali estrazioni solo presentazionali ulteriori e la separazione
della form state di `SetupPage`.

## Commit creati

- `refactor(frontend-ui): extract federation identity links adapter`

## Prossima tranche

Completare l’audit dei workspace frontend. `AccountWorkspace`, `AdminWorkspace`
e i workflow root sono già composition root sottili; valutare invece `SetupPage`
per un hook di wizard solo se i test focalizzati coprono le transizioni.
