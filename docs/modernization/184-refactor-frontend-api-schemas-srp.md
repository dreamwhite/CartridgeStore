# Refactor frontend API schemas by domain

## Stato

Tranche completata con commit `refactor(frontend-api): split schemas by domain`.

## Moduli separati

Il precedente `frontend/src/lib/api/schemas.ts` è stato ridotto a un
compatibility barrel. Le definizioni sono ora organizzate in:

- `schemas/auth.ts`: principal, errori, autenticazione, token e passkey;
- `schemas/setup.ts`: stato, infrastruttura e risposte del setup;
- `schemas/workflow.ts`: submission, draft e paginazione del workflow;
- `schemas/catalog.ts`: giochi, catalogo e discovery document;
- `schemas/telemetry.ts`: download, score, run e metriche;
- `schemas/index.ts`: barrel pubblico del dominio schemas.

## Motivazione SRP

La separazione riduce il modulo monolitico senza introdurre nuove astrazioni:
ogni file raccoglie gli schemi del proprio contratto applicativo e conserva
le dipendenze esplicite. Il barrel storico continua a riesportare tutti gli
stessi simboli per i client esistenti.

## Contratti preservati

- Nessun endpoint, campo JSON, validazione Zod o ABI pubblico è stato cambiato.
- `adminResponseSchema` è stato mantenuto per il trasporto amministrativo.
- Il confronto delle esportazioni prima/dopo ha confermato gli stessi 49
  simboli pubblici.
- Non sono stati modificati database, autenticazione, firmware contract o dati
  operativi.
- I file locali generati da build/test sono rimasti fuori dal commit.

## Verifiche

Eseguite con Node `24.20.0`:

- `pnpm --dir frontend run typecheck` — PASS;
- `pnpm --dir frontend run lint` — PASS;
- `pnpm --dir frontend run test` — PASS, 50 file e 113 test;
- `pnpm --dir frontend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe oltre 100 caratteri sui nuovi moduli — nessuna violazione.

## Rischi residui

La tranche non introduce rischi funzionali rilevati. Le API frontend residue
sono ancora organizzate in alcuni moduli aggregati (`auth.ts`, `workflow.ts`,
`statistics.ts`, `profile.ts` e altri); saranno analizzate nelle prossime
tranche prima di eventuali estrazioni.

## Commit creati

- `refactor(frontend-api): split schemas by domain`

## Prossima tranche

Analizzare le API frontend monolitiche residue, iniziando da `auth.ts` e
`workflow.ts`, mantenendo barrel di compatibilità e verifiche complete dopo
ogni dominio.
