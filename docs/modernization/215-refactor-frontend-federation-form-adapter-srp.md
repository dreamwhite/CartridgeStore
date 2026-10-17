# Frontend federation form adapter SRP tranche

## Moduli separati

- `frontend/src/components/federation/provider-form-adapter.ts` contiene il
  tipo dei valori controllati, la validazione e la costruzione dei payload
  OIDC/SAML.
- `frontend/src/components/federation/use-provider-form.ts` conserva lo stato
  React, i setter e l’evento submit.
- `frontend/src/components/federation/provider-form-adapter.test.ts` verifica
  payload OIDC, trust set SAML e filtri degli update.

## Motivazione SRP

La costruzione dei payload e la validazione non dipendono da React. L’adapter
isola questa responsabilità dal hook mantenendo il form come unica fonte dello
stato interattivo.

## Contratti preservati

- I payload di creazione OIDC/SAML restano invariati.
- Gli update continuano a escludere `provider_id`, `protocol`, `issuer` e
  `client_secret`.
- Restano invariati canonical endpoint fallback, trust set PEM e messaggi di
  validazione.

## Verifica

- Node.js `24.20.0` — PASS.
- `pnpm --dir frontend run typecheck` — PASS.
- `pnpm --dir frontend run lint` — PASS.
- `pnpm --dir frontend run test` — PASS, 51 file e 116 test.
- `pnpm --dir frontend run build` — PASS.
- Controllo righe oltre 100 caratteri sui file coinvolti — PASS.
- `git diff --check` — PASS.

## Rischi residui

`use-provider-details` coordina query, mutation e invalidazione cache in un
unico lifecycle hook coerente. Non è stato diviso ulteriormente perché le
mutation condividono lo stesso provider, stato sensibile e refresh atomico.

## Commit

- `refactor(frontend-ui): extract federation form adapter`

## Prossima tranche

Completare l’audit frontend e, se non emergono altri confini reali, riprendere
le separazioni Fastify escludendo definitivamente Flask legacy.
