# Refactor frontend setup API by responsibility

## Stato

Tranche completata con commit `refactor(frontend-api): split setup API by
responsibility`.

## Moduli separati

Il precedente `frontend/src/lib/api/setup.ts` è stato ridotto a un
compatibility barrel. Le responsabilità sono ora distribuite in:

- `setup/types.ts`: tipi derivati dagli schemi pubblici;
- `setup/state.ts`: stato installazione, autorizzazione, progress e complete;
- `setup/validation.ts`: test SMTP e validazione OIDC/SAML;
- `setup/index.ts` e `setup.ts`: barrel pubblici compatibili.

## Motivazione SRP

Lo stato persistente del wizard e gli strumenti di validazione operativa hanno
endpoint e responsabilità differenti. La separazione rende esplicito il
confine senza introdurre un transport layer artificiale: tutti i client usano
ancora direttamente il request adapter esistente.

I client `metrics.ts`, `statistics.ts`, `profile.ts` e `scores.ts` sono stati
analizzati nella stessa tranche. Sono già moduli piccoli, con responsabilità
coese e senza aggregazioni interne significative; non sono stati frammentati.

## Contratti preservati

- Nessun endpoint, metodo HTTP, header CSRF, payload o schema di risposta è
  cambiato.
- Il barrel storico mantiene gli stessi quattro tipi e nove funzioni pubbliche
  del client setup.
- Non sono stati modificati autenticazione backend, database, firmware contract
  o dati operativi.

## Verifiche

Eseguite con Node `24.20.0`:

- `pnpm --dir frontend run typecheck` — PASS;
- `pnpm --dir frontend run lint` — PASS;
- `pnpm --dir frontend run test` — PASS, 50 file e 113 test;
- `pnpm --dir frontend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe oltre 100 caratteri sui nuovi moduli — nessuna violazione.

## Rischi residui

Non sono emersi rischi funzionali nella tranche. La fase API frontend è ora
organizzata per dominio principale; resta da valutare la separazione dei
componenti/workspace grandi (`FederationWorkspace`, `SetupPage`,
`AccountWorkspace`, `AdminWorkspace` e workflow components).

## Commit creati

- `refactor(frontend-api): split setup API by responsibility`

## Prossima tranche

Analizzare i workspace frontend più grandi, iniziando da `FederationWorkspace`,
per estrarre hook, mutation/query adapter, tipi, form state e presentational
components senza cambiare il comportamento UI o i contratti API.
