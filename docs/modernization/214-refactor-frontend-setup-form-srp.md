# Frontend setup form SRP tranche

## Moduli separati

- `frontend/src/components/setup/setup-form.ts` contiene il tipo dello stato
  form, la normalizzazione degli errori e il mapping dei valori verso i
  payload dei singoli step.
- `frontend/src/components/setup/use-setup-wizard.ts` conserva stato React,
  transizioni, autorizzazione, salvataggio e completamento del wizard.

## Motivazione SRP

Il mapping dei campi è logica deterministica e indipendente dal lifecycle
React. Separarlo riduce il hook senza introdurre un adapter API diverso o
modificare le transizioni del wizard.

## Contratti preservati

- I payload per admin, store, registration, security, SMTP, OIDC, SAML e mDNS
  sono invariati.
- Restano invariati endpoint, token handling, CSRF, messaggi e redirect.
- Nessun contratto backend o schema è stato modificato.

## Verifica

- Node.js `24.20.0` — PASS.
- `pnpm --dir frontend run typecheck` — PASS.
- `pnpm --dir frontend run lint` — PASS.
- `pnpm --dir frontend run test` — PASS, 50 file e 113 test.
- `pnpm --dir frontend run build` — PASS.
- Controllo righe oltre 100 caratteri sui file coinvolti — PASS.
- `git diff --check` — PASS.

## Rischi residui

Il componente di pagina del setup resta sottile e il resto del wizard è già
diviso tra hook, step e componenti di presentazione. Non sono state create
ulteriori astrazioni prive di responsabilità autonoma.

## Commit

- `refactor(frontend-ui): extract setup form adapter`

## Prossima tranche

Valutare i hook federation rimasti più grandi (`use-provider-form` e
`use-provider-details`) solo se emergono confini stabili tra stato, mapping e
mutations.
