# UI.7.2 — AccountWorkspace SRP & Security Feature Architecture

## 1. Executive summary

UI.7.2 è stata implementata come refactor frontend isolato. `AccountWorkspace` è ora una shell di composizione che consuma l’identità autorevole tramite `useCurrentUser`, gestisce gli stati account-level e monta le feature password, API tokens, passkeys e session transition.

Le operazioni sensibili non sono più concentrate nel componente principale. Password, lifecycle dei token, secret one-time e cerimonia WebAuthn hanno confini e hook dedicati. Sono stati preservati endpoint, body, CSRF, cookie/session semantics, query-key factories e invalidazioni esistenti.

Decisione architetturale: `UI72_ACCOUNT_ARCHITECTURE_GO`.

## 2. Scope e compatibilità

Lo scope è limitato al frontend account. Non sono stati modificati backend, provider di autenticazione, cookie, database, Docker, routing, Authentik, Traefik o `../PRG32`.

Le interfacce interne dei componenti sono state riorganizzate come consentito dalla policy pre-release, mentre sono rimasti invariati:

- endpoint e response contract dell’auth API;
- acquisizione CSRF e `withCsrfToken` nell’API client;
- `authQueryKeys.currentUser()`, `authQueryKeys.tokens()` e `authQueryKeys.passkeys()`;
- cleanup delle cache private tramite `removeSensitiveQueryData`;
- password autocomplete, conferme destructive e messaggi di sessione;
- WebAuthn options adapter e ordine della registrazione.

## 3. Architettura iniziale

Il precedente `AccountWorkspace.tsx` conteneva header/session state, password form e mutation, token query/CRUD/secret, passkey query e cerimonia WebAuthn, rename/remove passkey, feedback e re-authentication nello stesso componente.

## 4. Responsibility inventory

| Responsabilità | Prima | Dopo |
|---|---|---|
| Current-user state e account-level states | `AccountWorkspace` | `AccountWorkspace` + `useCurrentUser` |
| Identità e session presentation | inline header | `session/AccountSessionPanel.tsx` |
| Cache cleanup e re-auth redirect | inline footer | `session/AccountSessionPanel.tsx` (`ReauthenticateButton`) |
| Password form/mutation/reset | inline | `password/PasswordSecurityPanel.tsx`, `use-password-security.ts` |
| Token query/create/rename/revoke | inline | `tokens/ApiTokensPanel.tsx`, `use-api-tokens.ts` |
| One-time token secret | `AccountWorkspace` state | `use-api-tokens.ts` lifecycle-local state |
| Passkey query/ceremony/mutations | inline | `passkeys/PasskeysPanel.tsx`, `use-passkeys.ts` |
| Shared account API error feedback | inline helper | `account-ui.tsx` |

## 5. Final feature boundaries

La struttura finale è:

```text
frontend/src/components/account/
├── AccountWorkspace.tsx
├── AccountWorkspace.test.tsx
├── account-ui.tsx
├── session/
│   └── AccountSessionPanel.tsx
├── password/
│   ├── PasswordSecurityPanel.tsx
│   ├── PasswordSecurityPanel.test.tsx
│   └── use-password-security.ts
├── tokens/
│   ├── ApiTokensPanel.tsx
│   ├── ApiTokensPanel.test.tsx
│   └── use-api-tokens.ts
└── passkeys/
    ├── PasskeysPanel.tsx
    ├── PasskeysPanel.test.tsx
    └── use-passkeys.ts
```

## 6. AccountWorkspace shell

`AccountWorkspace` ora contiene solo:

- consumo dell’authoritative `useCurrentUser()`;
- loading/error/anonymous account state;
- composizione delle feature;
- key identity-scoped sul pannello token, così il secret locale viene smontato quando cambia l’utente;
- ordine visuale originale della pagina.

Il link `Re-authenticate` resta in fondo alla pagina, come prima, ma è ospitato da `ReauthenticateButton` nel confine session.

Marker: `UI72_ACCOUNT_SHELL_GO`.

## 7. Password feature

`use-password-security.ts` possiede i tre valori transitori della form e la mutation `changePassword`. I valori non entrano in query key, Zustand, localStorage o log. Il reset dei tre campi avviene solo dopo successo, mantenendo il comportamento precedente.

`PasswordSecurityPanel.tsx` mantiene:

- `current-password` e `new-password` autocomplete;
- campi required;
- loading/disabled state del submit;
- feedback success/error semantico;
- body e endpoint esistenti tramite `changePassword`.

Marker: `UI72_PASSWORD_FEATURE_GO`.

## 8. API token feature

`use-api-tokens.ts` possiede listing, create, rename, revoke e invalidazione esclusiva di `authQueryKeys.tokens()`. `ApiTokensPanel.tsx` possiede label form, row state, conferma revoke, loading/empty/error feedback e presentation del secret.

Non sono state introdotte scope, capability o endpoint nuovi.

Marker: `UI72_TOKEN_LIFECYCLE_GO`.

## 9. One-time token secret lifecycle

Il secret restituito da `createAuthToken` non è il valore della mutation data: la mutation ritorna `void`, mentre il secret viene trasferito direttamente nello stato locale del hook. Non viene quindi inserito nei dati della query `authQueryKeys.tokens()`.

Il secret viene rimosso quando:

- l’utente preme `Dismiss`;
- il pannello token viene smontato;
- cambia l’identità, tramite key identity-scoped in `AccountWorkspace`;
- il componente diventa non montato prima del completamento asincrono;
- l’operazione non appartiene più al lifecycle visuale attivo.

`mountedRef` impedisce di reintrodurre un secret dopo un unmount. Non esistono URL parameters, storage persistente, Zustand state, console logging o analytics per il secret.

Marker: `UI72_TOKEN_SECRET_SAFETY_GO`.

## 10. Passkey feature

`use-passkeys.ts` possiede listing, enrollment, rename, remove/revoke e invalidazione di `authQueryKeys.passkeys()`. `PasskeysPanel.tsx` possiede prompt, action buttons, availability/empty/loading/error presentation e conferme.

Le mutation non usano retry automatici e le azioni rename/remove restano disabilitate per credential revoked o durante la rispettiva mutation.

Marker: `UI72_PASSKEY_FEATURE_GO`.

## 11. WebAuthn ceremony preservation

L’ordine effettivo è rimasto:

1. prompt della password corrente e display name;
2. `reauthenticate(password)`;
3. `beginPasskeyRegistration()`;
4. `toRegistrationOptions(options)` dell’adapter UI.6;
5. `startRegistration({ optionsJSON })` del browser;
6. `finishPasskeyRegistration(response, displayName)`;
7. invalidazione di `authQueryKeys.passkeys()` dopo successo.

Non sono stati modificati RP ID, origin, challenge, transport, attestation, session requirements o CSRF. La cancellazione browser `NotAllowedError` viene resa come cancellazione esplicita invece di essere confusa con un successo; gli altri errori mantengono il feedback esistente e non espongono payload WebAuthn.

Marker: `UI72_WEBAUTHN_PRESERVATION_GO`.

## 12. TanStack Query ownership e invalidation

Le feature usano le factory esistenti:

- current user: `useCurrentUser()` con `authQueryKeys.currentUser()`;
- tokens: `authQueryKeys.tokens()`;
- passkeys: `authQueryKeys.passkeys()`.

Invalidazioni:

- create/rename/revoke token: token list only;
- enroll/rename/remove passkey: passkey list only;
- password change: nessuna invalidazione nuova, come prima;
- re-authentication: rimozione delle query private esistenti e current-user query.

Non sono stati creati query key inline, query persistence o nuovi Zustand store.

Marker: `UI72_QUERY_OWNERSHIP_GO`.

## 13. Authentication e session safety

L’identità mostrata nell’account deriva da `useCurrentUser`; non è stata duplicata in Zustand o storage. La stessa query key/hook già usata dal protected route viene riutilizzata e non è stato introdotto un secondo endpoint o un secondo session store.

Il cleanup di `removeSensitiveQueryData` resta invariato. I pannelli account non vengono montati per una sessione anonima. Il passaggio di identity al token feature è protetto dal key remount, e il pannello secret non può sopravvivere al cambio utente.

Non sono stati modificati logout, protected-route handling, login o auth navigation.

Marker: `UI72_SESSION_SAFETY_GO`.

## 14. Asynchronous race safety

La protezione è intenzionalmente locale:

- `AccountWorkspace` usa la identity come `key` del token panel;
- il token hook mantiene `mountedRef` per non aggiornare stato dopo unmount;
- il secret non viene esposto dalla mutation cache;
- le mutation passkey restano legate all’observer del feature hook e non hanno retry automatici.

Non è stato introdotto un framework concorrente globale. Il test token copre la separazione del secret dai query data; il test shell copre l’esclusione della composizione per sessione anonima.

Marker: `UI72_ASYNC_RACE_SAFETY_GO`.

## 15. Form state e design system

Password e token label restano React local state nel rispettivo feature/hook. Sono riutilizzati `Button`, `Field`, `Badge` e `StatusMessage` di UI.5. Non sono state aggiunte dipendenze o palette nuove e non è stato ridisegnato il layout account.

## 16. Legacy cleanup

Sono state rimosse da `AccountWorkspace.tsx` le mutation password/token/passkey, il `TokenRow` inline, il WebAuthn ceremony function, gli import API e il secret state. Non sono stati aggiunti alias o wrapper per mantenere il vecchio componente monolitico.

Marker: `UI72_LEGACY_CLEANUP_GO`.

## 17. Accessibility verification

Sono stati preservati o migliorati:

- label programmatiche attraverso il `Field` UI.5;
- autocomplete password;
- required state;
- disabled/loading state;
- nomi espliciti per create, rename, revoke, add/remove passkey;
- `role="status"` per loading e secret warning;
- `StatusMessage` semantico per errori e successo;
- conferme keyboard-accessible tramite bottoni nativi.

Marker: `UI72_ACCESSIBILITY_GO`.

## 18. Responsive e visual verification

Le sezioni mantengono `surface-card`, padding, grid e breakpoint già presenti. Password resta una grid a tre colonne da `sm`; token form e rows restano stacked su viewport strette; passkey actions restano flex-wrap/stacked. Non sono state introdotte nuove card, gradienti, ombre o component library.

Sono stati eseguiti test component-level sintetici, ma non una nuova sessione browser autenticata alle larghezze 375/768/1024/1440/1920 in entrambi i temi. L’acceptance visuale live resta quindi separata.

Marker: `UI72_RESPONSIVE_INCOMPLETE` — layout preservato, verifica browser autenticata dedicata non eseguita.

## 19. Test added/updated

Sono stati aggiunti:

- `AccountWorkspace.test.tsx`: authenticated composition e anonymous exclusion;
- `password/PasswordSecurityPanel.test.tsx`: password locality, autocomplete, success reset e mutation body;
- `tokens/ApiTokensPanel.test.tsx`: create, one-time display, dismiss e assenza del secret nei query data;
- `passkeys/PasskeysPanel.test.tsx`: reauthentication, options request, adapter invocation, browser registration e finish request.

Tutti i test usano fixture sintetiche e mockano solo i confini API/browser. Non vengono creati token reali, passkey reali o sessioni operative.

## 20. Validation commands and results

Tutte le verifiche sono state eseguite con Node.js 24 tramite `nvm use 24`.

| Command | Result |
|---|---|
| `pnpm run typecheck` in `frontend/` | PASS |
| `pnpm run lint` in `frontend/` | PASS |
| `pnpm run test` in `frontend/` | PASS — 45 test files, 100 tests |
| `pnpm run build` in `frontend/` | PASS — Next.js 16.4.0, 40 routes generated |
| `git diff --check` | PASS |
| Focused `pnpm exec vitest run src/components/account` | PASS — 4 files, 5 tests |

Il baseline UI.7.1 era 41 file e 95 test. UI.7.2 aggiunge 4 file di test e 5 test, arrivando a 45 file e 100 test.

Non sono stati eseguiti test browser autenticati reali, mutation contro infrastruttura condivisa, test backend o comandi Docker: sono fuori scope e vietati da questa milestone.

Marker: `UI72_FRONTEND_REGRESSION_GO`.

## 21. Files changed

Modified:

- `frontend/src/components/account/AccountWorkspace.tsx`.

Added:

- `frontend/src/components/account/AccountWorkspace.test.tsx`;
- `frontend/src/components/account/account-ui.tsx`;
- `frontend/src/components/account/session/AccountSessionPanel.tsx`;
- `frontend/src/components/account/password/PasswordSecurityPanel.tsx`;
- `frontend/src/components/account/password/PasswordSecurityPanel.test.tsx`;
- `frontend/src/components/account/password/use-password-security.ts`;
- `frontend/src/components/account/tokens/ApiTokensPanel.tsx`;
- `frontend/src/components/account/tokens/ApiTokensPanel.test.tsx`;
- `frontend/src/components/account/tokens/use-api-tokens.ts`;
- `frontend/src/components/account/passkeys/PasskeysPanel.tsx`;
- `frontend/src/components/account/passkeys/PasskeysPanel.test.tsx`;
- `frontend/src/components/account/passkeys/use-passkeys.ts`;
- questo report.

Nessun file backend, API client, auth provider, database, Docker o infrastruttura è stato modificato.

## 22. Remaining account architecture debt

- La verifica live autenticata e responsive completa resta da eseguire in un ambiente autorizzato.
- Password feedback conserva il contratto UI precedente e non espone dettagli specifici dell’errore server; un successivo lavoro può migliorare le distinzioni senza modificare il backend.
- Le mutation rename/remove passkey non mostrano un success message dedicato perché il comportamento precedente esponeva solo error feedback.
- La protected route e l’account shell condividono la stessa query key/hook e cache TanStack; non è stato introdotto un secondo endpoint, ma una futura API di composizione potrebbe passare il principal esplicitamente per ridurre il doppio consumo del hook.

## 23. Deferred UI.7.3 work

UI.7.3 può coprire una verifica visuale/browser autorizzata dell’account, test di session expiry e identity transition con un QueryClient reale, e un audit di accessibilità interattivo. Non è stata avviata in questa milestone.

## 24. Next milestone readiness

Il frontend account è pronto per acceptance sintetica e successiva acceptance browser autorizzata. Prima di eseguire mutation reali servono un ambiente isolato, credenziali esplicitamente autorizzate e una policy per non modificare identità, token o passkey condivisi.

## 25. Decision markers

- `UI72_ACCOUNT_SHELL_GO`
- `UI72_PASSWORD_FEATURE_GO`
- `UI72_TOKEN_LIFECYCLE_GO`
- `UI72_TOKEN_SECRET_SAFETY_GO`
- `UI72_PASSKEY_FEATURE_GO`
- `UI72_WEBAUTHN_PRESERVATION_GO`
- `UI72_QUERY_OWNERSHIP_GO`
- `UI72_SESSION_SAFETY_GO`
- `UI72_ASYNC_RACE_SAFETY_GO`
- `UI72_LEGACY_CLEANUP_GO`
- `UI72_ACCESSIBILITY_GO`
- `UI72_RESPONSIVE_INCOMPLETE`
- `UI72_FRONTEND_REGRESSION_GO`
- `UI72_ACCOUNT_ARCHITECTURE_GO`

Preserved status markers:

- `M555_BACKEND_FREEZE_GO`
- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

## 26. Final decision

`UI72_ACCOUNT_ARCHITECTURE_GO` per il refactor SRP, la separazione delle feature di sicurezza e le verifiche frontend eseguite.

Il risultato non autorizza deployment, cutover operativo, modifica di backend/provider/database/infrastruttura, token o passkey reali, commit o push. La verifica browser autenticata e responsive completa resta esplicitamente non dichiarata come passata.
