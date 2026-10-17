# Refactor setup wizard state and transitions

## Stato

Tranche completata con commit `refactor(frontend-ui): extract setup wizard
state hook`.

## Moduli separati

È stato creato:

- `frontend/src/components/setup/use-setup-wizard.ts`.

Il hook possiede caricamento status/progress, autorizzazione, stato form,
mapping dei payload per step, save/skip/finish e redirect finale. `app/setup`
mantiene il rendering delle schermate e dei campi.

## Motivazione SRP

`SetupPage` combinava macchina di stato, payload mapping e un rendering
condizionale molto esteso. Il hook separa la logica applicativa del wizard dal
branching visuale senza introdurre store globale o cambiare il flusso.

## Contratti preservati

- Endpoint, metodi HTTP, CSRF, payload per tutti gli step e redirect invariati;
- ordine e progressione degli step invariati;
- gestione dei segreti SMTP e token bootstrap invariata;
- nessuna modifica a database, autenticazione o firmware contract.

## Verifiche

Eseguite con Node `24.20.0`:

- `pnpm --dir frontend run typecheck` — PASS;
- `pnpm --dir frontend run lint` — PASS;
- `pnpm --dir frontend run test` — PASS, 50 file e 113 test;
- `pnpm --dir frontend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe oltre 100 caratteri nel nuovo hook — nessuna violazione.

## Rischi residui

La fase frontend ha ora API e principali workspace separati per dominio. Restano
solo eventuali estrazioni presentazionali minori; Account/Admin/workflow root
sono già composition root sottili.

## Commit creati

- `refactor(frontend-ui): extract setup wizard state hook`

## Prossima tranche

Eseguire una verifica finale frontend e passare all’analisi dei moduli Fastify
indicati dal piano SRP, iniziando da `backend/src/config/env.ts` e
`backend/src/consistency/publication.ts`.
