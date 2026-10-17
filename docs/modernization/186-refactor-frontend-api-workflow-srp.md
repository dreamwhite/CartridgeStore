# Refactor frontend workflow API by feature

## Stato

Tranche completata con commit `refactor(frontend-api): split workflow API by
feature`.

## Moduli separati

Il precedente `frontend/src/lib/api/workflow.ts` è stato ridotto a un
compatibility barrel. Le responsabilità sono ora distribuite in:

- `workflow/transport.ts`: proxy, validazione dei path, richiesta JSON e cache
  CSRF;
- `workflow/session.ts`: principal autenticato del workflow;
- `workflow/submissions.ts`: liste, dettaglio, submission dell'utente e
  resubmission;
- `workflow/drafts.ts`: ciclo di vita dei draft e allegati;
- `workflow/publishing.ts`: upload del bundle per la pubblicazione;
- `workflow/review.ts`: approvazione e rifiuto delle submission;
- `workflow/errors.ts`: mapping degli errori per la UI;
- `workflow/index.ts` e `workflow.ts`: barrel pubblici compatibili.

## Motivazione SRP

Il modulo precedente gestiva contemporaneamente trasporto, stato CSRF, draft,
pubblicazione e review. I nuovi confini seguono i flussi già separati nei
workspace creator e reviewer, lasciando le regole condivise nel trasporto e
senza introdurre astrazioni generiche.

## Contratti preservati

- Nessun endpoint, metodo HTTP, proxy prefix, header, payload o schema è stato
  cambiato.
- Restano invariati il caching del CSRF, l'invalidazione dopo `csrf_failed`, la
  gestione dell'integrazione Fastify assente e l'encoding degli id draft.
- Il barrel storico conserva gli stessi simboli pubblici: proxy prefix, errore
  di integrazione, gestione sessione, API creator/reviewer e messaggi errore.
- Non sono stati modificati database, autenticazione backend, firmware contract
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

Non sono emersi rischi funzionali nella tranche. Restano da analizzare
`federation-admin.ts`, `setup.ts` e i moduli metrics/statistics/profile/scores,
poi i workspace e componenti più grandi.

## Commit creati

- `refactor(frontend-api): split workflow API by feature`

## Prossima tranche

Analizzare `federation-admin.ts`, verificando se schema, tipi e adapter possono
essere separati per provider, identity e trasporto senza alterare il contratto
amministrativo.
