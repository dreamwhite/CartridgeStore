# Fastify authentication validation SRP refactor

## Moduli separati

- `backend/src/auth/errors.ts` contiene gli errori di indisponibilità writer,
  validazione e conflitto dell'autenticazione.
- `backend/src/auth/validation.ts` contiene conversione scalare, validazione
  email, password e payload account.
- `backend/src/auth/service.ts` mantiene sessioni, token, transazioni,
  registrazione, bootstrap e reset password.

## Motivazione SRP

Il servizio auth includeva errori e validatori puri insieme ai flussi che
gestiscono database, sessioni e delivery email. Le regole senza stato sono ora
isolate, mentre il servizio conserva le operazioni atomiche e le decisioni di
autenticazione.

## Contratti preservati

- Endpoint, response shape, messaggi di errore e status code invariati.
- Gli import pubblici da `auth/service.ts` sono mantenuti tramite re-export.
- Nessuna modifica a password hashing, sessioni, token, autorizzazioni,
  database o contratti firmware.

## Test eseguiti

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sui nuovi moduli — PASS

## Rischi residui

Il servizio auth resta volutamente responsabile dei flussi multi-step e delle
transazioni che coordinano account, token, sessioni e email. La generazione
degli hash resta nel servizio per mantenere invariati gli import esistenti.

## Commit creato

- `refactor(fastify-auth): extract authentication validation`

## Prossima tranche

Continuare con i moduli Fastify residui, valutando servizi OIDC/SAML e storage
solo dove esistono confini reali e testabili.
