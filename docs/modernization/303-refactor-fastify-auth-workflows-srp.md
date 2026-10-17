# Tranche 303 — Fastify authentication workflows

## Moduli separati

- `backend/src/auth/registration-workflow.ts`
- `backend/src/auth/password-workflow.ts`
- `backend/src/auth/password-hash.ts`
- `backend/src/auth/workflow-context.ts`
- `backend/src/auth/workflow-schema.ts`
- `backend/src/auth/service.ts`

## Motivazione SRP

`AuthService` coordinava autenticazione, sessioni, bootstrap, registrazione,
recupero password e gestione dei token. La tranche ha estratto i workflow di
registrazione e password in servizi di dominio con dipendenze esplicite; il
servizio originale resta la facciata pubblica per le route e per i consumer
interni.

La generazione dell’hash Werkzeug-compatible è stata isolata in un modulo
dedicato, mantenendo l’export storico da `auth/service.ts`.

## Contratti preservati

- Restano invariati route, endpoint, response shape, errori e messaggi.
- Restano invariati sessioni, invalidazione, CSRF, policy di registrazione e
  gestione dei token monouso.
- Restano invariati schema SQLite, migrazioni idempotenti e transazioni.
- Restano invariati gli export pubblici di `AuthService`, degli errori,
  `validatePassword` e `generateWerkzeugScryptHash`.
- Non sono cambiate autenticazione federata, autorizzazioni o contratti
  firmware.
- Flask legacy è stato lasciato fuori dall’intervento come richiesto.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- controllo righe lunghe dei nuovi moduli — PASS
- `git diff --check` — PASS

## Rischi residui

`AuthService` mantiene ancora bootstrap, session context e token management
perché sono confini distinti da valutare in tranche successive; questa
separazione non introduce un nuovo contratto tra route e dominio.

## Commit

- `refactor(fastify-auth): extract account workflows`

## Prossima tranche

Continuare l’analisi Fastify sui moduli ancora grandi, valutando solo confini
di dominio verificabili e mantenendo la compatibilità pubblica.
