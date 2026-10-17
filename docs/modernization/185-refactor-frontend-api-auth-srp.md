# Refactor frontend authentication API by feature

## Stato

Tranche completata con commit `refactor(frontend-api): split authentication API
by feature`.

## Moduli separati

Il precedente `frontend/src/lib/api/auth.ts` è stato ridotto a un
compatibility barrel. Le responsabilità sono ora distribuite in:

- `auth/transport.ts`: validazione del path e acquisizione CSRF;
- `auth/session.ts`: principal, login, logout, cambio password e
  reautenticazione;
- `auth/federation.ts`: provider federati e URL di login sicuri;
- `auth/tokens.ts`: ciclo di vita dei token API;
- `auth/registration.ts`: richiesta e completamento della registrazione;
- `auth/password.ts`: recupero e reset della password;
- `auth/passkeys.ts`: registrazione, login e revoca delle passkey;
- `auth/errors.ts`: mapping degli errori in messaggi UI;
- `auth.ts`: barrel pubblico compatibile.

## Motivazione SRP

Il modulo precedente combinava otto responsabilità con endpoint, payload e
messaggi di errore differenti. La separazione segue i confini funzionali già
presenti nei workspace e negli hook, mantenendo il trasporto comune isolato e
senza introdurre un nuovo livello di astrazione.

Le API pubbliche del barrel restano invariate: sono state mantenute le stesse
24 funzioni esportate, inclusi `getAuthCsrf`, `authErrorMessage` e gli helper
di federazione usati direttamente dai componenti.

## Contratti preservati

- Nessun endpoint, metodo HTTP, header CSRF, payload o schema di risposta è
  cambiato.
- Sono rimasti invariati il routing opzionale verso `/api/auth`, la sanitizzazione
  dei return path e l'encoding degli identificativi.
- Non sono stati modificati autenticazione backend, database, firmware contract
  o dati operativi.
- Il barrel `frontend/src/lib/api/auth.ts` continua a supportare tutti gli
  import esistenti.

## Verifiche

Eseguite con Node `24.20.0`:

- `pnpm --dir frontend run typecheck` — PASS;
- `pnpm --dir frontend run lint` — PASS;
- `pnpm --dir frontend run test` — PASS, 50 file e 113 test;
- `pnpm --dir frontend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe oltre 100 caratteri sui nuovi moduli — nessuna violazione.

## Rischi residui

Non sono emersi rischi funzionali nella tranche. Restano da analizzare il
workflow API, la federation-admin API e i moduli setup/statistics/profile/
scores/metrics, con priorità al workflow perché concentra i flussi creator e
reviewer.

## Commit creati

- `refactor(frontend-api): split authentication API by feature`

## Prossima tranche

Separare `frontend/src/lib/api/workflow.ts` per trasporto, lettura delle
submission, draft creator, pubblicazione e review, mantenendo il barrel e i
contratti dei flussi esistenti.
