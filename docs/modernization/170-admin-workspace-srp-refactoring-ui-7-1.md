# UI.7.1 — AdminWorkspace SRP & Feature Architecture

## 1. Executive summary

UI.7.1 è stata implementata come refactor frontend isolato. `AdminWorkspace` è ora una shell di composizione: risolve il principal Fastify, filtra la navigazione in base alle capability restituite dal backend, mantiene la sezione Zustand e monta il pannello attivo.

Le responsabilità di dominio sono state spostate in moduli feature-owned per settings, users, groups, roles, tokens, catalog moderation, audit e backup. Le query e le mutation usano le factory `adminQueryKeys` già introdotte da UI.6. Non sono stati modificati backend, API, database, Docker, autenticazione, CSRF, routing o infrastruttura operativa.

Decisione architetturale: `UI71_ADMIN_ARCHITECTURE_GO`.

## 2. Scope e policy di compatibilità

Lo scope è limitato a `frontend/src/components/admin/`. Sono state consentite modifiche alle interfacce interne dei componenti perché il progetto non è ancora deployato, ma sono stati preservati:

- endpoint, metodi HTTP, payload e response contract dell’admin API;
- proxy Fastify `__admin-fastify` e gestione errori esistente;
- acquisizione CSRF e header `X-CSRFToken` nell’API client;
- permission filtering frontend senza usarlo come sostituto dell’autorizzazione backend;
- invalidazione TanStack Query e cleanup della sessione privata;
- conferme browser per operazioni distruttive.

## 3. Architettura iniziale

Il precedente `AdminWorkspace.tsx` concentrava shell, navigazione, principal query, otto domini amministrativi, form state, query, mutation, invalidazioni, feedback e componenti di riga/editor. Il file aveva 205 linee fortemente compresse e importava direttamente tutte le dipendenze di dominio.

## 4. Inventario delle responsabilità

| Responsabilità | Prima | Dopo |
|---|---|---|
| Principal, capability e sezione corrente | `AdminWorkspace` | `AdminWorkspace` |
| Navigazione permission-aware | inline shell | `AdminNavigation` |
| Query/mutation settings e SMTP/assets | inline shell | `settings/use-settings.ts`, `settings/SettingsPanel.tsx` |
| Lista, dettaglio e mutation users | inline shell | `users/use-users.ts`, `UsersPanel.tsx`, `UserDetails.tsx` |
| Group CRUD e row state | inline shell | `groups/use-groups.ts`, `GroupsPanel.tsx` |
| Roles read-only | inline shell | `roles/RolesPanel.tsx` |
| Token listing/revoke | inline shell | `tokens/use-tokens.ts`, `TokensPanel.tsx` |
| Catalog moderation/editor | inline shell | `catalog/use-catalog-moderation.ts`, `CatalogModerationPanel.tsx` |
| Audit read-only | inline shell | `audit/AuditPanel.tsx` |
| Backup/restore controls | inline shell | `backups/BackupPanel.tsx` |
| Primitive `Notice`, `Panel`, `Field`, `Table` | inline shell | `admin-ui.tsx` |

## 5. Directory structure finale

```text
frontend/src/components/admin/
├── AdminNavigation.tsx
├── AdminNavigation.test.tsx
├── AdminWorkspace.tsx
├── AdminWorkspace.test.tsx
├── admin-ui.tsx
├── audit/AuditPanel.tsx
├── backups/BackupPanel.tsx
├── catalog/CatalogModerationPanel.tsx
├── catalog/use-catalog-moderation.ts
├── groups/GroupsPanel.tsx
├── groups/GroupsPanel.test.tsx
├── groups/use-groups.ts
├── roles/RolesPanel.tsx
├── settings/SettingsPanel.tsx
├── settings/use-settings.ts
├── tokens/TokensPanel.tsx
├── tokens/use-tokens.ts
└── users/
    ├── UserDetails.tsx
    ├── UsersPanel.tsx
    └── use-users.ts
```

## 6. Shell e navigazione

`AdminWorkspace` ora contiene solo:

- `adminQueryKeys.principal()` e la query del principal;
- capability filtering tramite `ADMIN_NAV_ITEMS`;
- loading, error, anonymous e no-permission states;
- selezione della sezione tramite `useAdminStore`;
- composizione di `ActivePanel`.

`AdminNavigation` riceve una lista già filtrata e comunica la selezione tramite callback. Le label, sezioni, permission string, layout responsive e classi visuali esistenti sono state mantenute.

Marker: `UI71_ADMIN_SHELL_GO`.

## 7. Feature extraction

Ogni pannello mantiene la presentazione del dominio e il relativo local form state. Gli hook feature-owned orchestrano solo le query e le mutation significative del dominio; non è stato introdotto un generico CRUD hook o un framework interno.

In particolare:

- settings mantiene draft settings, runtime configuration, SMTP test e asset upload;
- users mantiene paginazione, ricerca, creazione, selezione, dettaglio, ruolo, gruppi, status e delete;
- groups mantiene create/rename/delete e la protezione del gruppo `editors`;
- catalog mantiene inventario moderation, dettaglio, metadata, moderation actions e delete architecture;
- tokens mantiene listing e revoke;
- audit e roles restano read-only;
- backup mantiene download, restore, conferma e session cleanup.

Marker: `UI71_FEATURE_BOUNDARIES_GO`.

## 8. TanStack Query ownership

Sono riutilizzate le factory UI.6 senza nuove chiavi inline:

- `adminQueryKeys.settings()`;
- `adminQueryKeys.users(...)`, `usersRoot()` e `user(id)`;
- `adminQueryKeys.groups()` e `roles()`;
- `adminQueryKeys.tokens(...)` e `tokensRoot()`;
- `adminQueryKeys.catalog(...)`, `catalogRoot()` e `cartridge(...)`;
- `adminQueryKeys.audit(100)`;
- `adminQueryKeys.principal()` nella shell.

I dati server non sono stati spostati in Zustand e non sono stati persistiti in localStorage.

Marker: `UI71_QUERY_OWNERSHIP_GO`.

## 9. Mutation invalidation

Le invalidazioni sono rimaste nel dominio corretto:

- settings: settings family;
- users: users root e dettaglio selezionato;
- groups: groups family;
- tokens: tokens root;
- catalog: catalog root e cartridge detail;
- asset upload: settings family.

La delete user mantiene anche il comportamento precedente di deselezionare il dettaglio dopo il successo. Non sono state introdotte mutation optimistic né retry automatici per operazioni sensibili.

Marker: `UI71_INVALIDATION_GO`.

## 10. RBAC, autenticazione e session safety

Il frontend continua a mostrare le sezioni solo quando la capability corrispondente è presente nel principal Fastify. Gli errori 401/403 e l’errore di integrazione Fastify continuano a passare dal feedback esistente. La visibilità della sezione non è stata usata come autorizzazione sostitutiva: le verifiche backend restano autorevoli.

Non sono stati modificati login, logout, cookie, reauthentication, provider federation o cleanup delle cache private.

Marker: `UI71_RBAC_PRESERVATION_GO`.

## 11. CSRF e trasporto

I componenti continuano a chiamare `adminApi`; non sono state duplicate chiamate `fetch`, non sono stati modificati path, origin, metodi o body. La gestione CSRF resta incapsulata in `frontend/src/lib/api/admin.ts` e `frontend/src/lib/api/client.ts`.

Marker: `UI71_CSRF_PRESERVATION_GO`.

## 12. Form state e design system

Il form state è locale al feature component o all’editor che lo usa. Non è stato aggiunto form state a Zustand. Sono riutilizzati i primitivi UI.5 `Button`, `StatusMessage` tramite `Notice` condiviso, e i controlli `Field`/`Table` ora raccolti in `admin-ui.tsx`. Non sono state aggiunte dipendenze.

Marker: `UI71_FORM_OWNERSHIP_GO`.

## 13. Legacy cleanup

Sono state rimosse da `AdminWorkspace.tsx` le implementazioni inline dei pannelli, degli editor, dei row component, dei helper di feedback e dei primitivi condivisi. Non esistono più alias compatibili o wrapper amministrativi duplicati. La FederationWorkspace è rimasta fuori dal refactor.

Marker: `UI71_LEGACY_CLEANUP_GO`.

## 14. Accessibility e responsive verification

La navigazione conserva `aria-label="Administrative sections"`, bottoni nativi, label associate ai campi, legends per i gruppi e testo di stato accessibile. I test sintetici verificano le label e l’interazione della navigation.

Il layout usa gli stessi breakpoint e classi responsive dell’implementazione precedente: navigation orizzontale su viewport strette e colonna laterale da `lg` in poi, tabelle con overflow locale e form grid responsive. Non è stata eseguita una nuova sessione browser autenticata sulle cinque larghezze richieste; l’acceptance live resta quindi distinta dall’evidenza automatizzata.

Marker: `UI71_ACCESSIBILITY_GO`.

Marker: `UI71_RESPONSIVE_INCOMPLETE` — struttura responsive preservata, verifica visuale autenticata dedicata non eseguita.

La verifica visuale live non è stata dichiarata come completata perché la milestone vieta di indovinare credenziali o modificare identità condivise.

## 15. Test aggiunti e aggiornati

Sono stati aggiunti:

- `AdminNavigation.test.tsx`: filtering già effettuato dal parent e callback di selezione;
- `groups/GroupsPanel.test.tsx`: query reale tramite `QueryClient`, rendering synthetic e create mutation del dominio.

Il test preesistente `AdminWorkspace.test.tsx` continua a coprire permission-aware navigation e principal senza capability. I test usano dati sintetici e non toccano database, servizi condivisi o credenziali reali.

## 16. Validation evidence

Tutte le verifiche sono state eseguite con Node.js 24 tramite `nvm use 24`.

| Command | Result |
|---|---|
| `pnpm run typecheck` in `frontend/` | PASS |
| `pnpm run lint` in `frontend/` | PASS |
| `pnpm run test` in `frontend/` | PASS — 41 test files, 95 tests |
| `pnpm run build` in `frontend/` | PASS — Next.js 16.4.0, 40 routes generated |
| `git diff --check` | PASS |
| Focused admin Vitest run | PASS — 3 files, 4 tests nella prima esecuzione focalizzata |

Il baseline dichiarato da UI.6 era 39 file e 93 test: il risultato corrente è 41 file e 95 test, quindi sono stati aggiunti due file e due test netti.

Non sono stati eseguiti test browser autenticati reali, mutation contro infrastruttura condivisa, test backend o comandi Docker perché fuori scope.

Marker: `UI71_FRONTEND_REGRESSION_GO`.

## 17. Files changed

Modified:

- `frontend/src/components/admin/AdminWorkspace.tsx`.

Added:

- `frontend/src/components/admin/AdminNavigation.tsx`;
- `frontend/src/components/admin/AdminNavigation.test.tsx`;
- `frontend/src/components/admin/admin-ui.tsx`;
- `frontend/src/components/admin/settings/SettingsPanel.tsx`;
- `frontend/src/components/admin/settings/use-settings.ts`;
- `frontend/src/components/admin/users/UsersPanel.tsx`;
- `frontend/src/components/admin/users/UserDetails.tsx`;
- `frontend/src/components/admin/users/use-users.ts`;
- `frontend/src/components/admin/groups/GroupsPanel.tsx`;
- `frontend/src/components/admin/groups/GroupsPanel.test.tsx`;
- `frontend/src/components/admin/groups/use-groups.ts`;
- `frontend/src/components/admin/roles/RolesPanel.tsx`;
- `frontend/src/components/admin/tokens/TokensPanel.tsx`;
- `frontend/src/components/admin/tokens/use-tokens.ts`;
- `frontend/src/components/admin/catalog/CatalogModerationPanel.tsx`;
- `frontend/src/components/admin/catalog/use-catalog-moderation.ts`;
- `frontend/src/components/admin/audit/AuditPanel.tsx`;
- `frontend/src/components/admin/backups/BackupPanel.tsx`;
- questo report.

Nessun file backend, infrastrutturale, database o di autenticazione è stato modificato per UI.7.1.

## 18. Remaining admin architecture debt

- I pannelli sono ora separati, ma alcuni JSX sono ancora molto compatti e possono essere ulteriormente resi leggibili senza cambiare ownership.
- Settings contiene ancora due famiglie di configurazione legacy/typed che riflettono il contratto esistente; non sono state unificate per non cambiare payload.
- Le feature test coverage è stata estesa con smoke e mutation coverage mirata, ma non ogni mutation distruttiva viene eseguita in test.
- L’acceptance browser autenticata e la verifica visiva completa a 375/768/1024/1440/1920 restano gate separati.

## 19. Deferred UI.7.2 work

UI.7.2 può occuparsi della successiva hardening di test e accessibilità dei pannelli admin, includendo test di invalidazione per ogni mutation, stati vuoti/error/loading per ogni dominio e verifica browser autenticata autorizzata. Non è stata avviata in questa milestone.

## 20. Next milestone readiness

Il frontend è pronto per un successivo lavoro di verifica admin autorizzata senza ulteriori modifiche strutturali obbligatorie. Prima di qualsiasi acceptance operativa devono restare disponibili credenziali di test autorizzate, un ambiente isolato e una policy esplicita per non eseguire mutation su infrastruttura condivisa.

## 21. Decision markers

- `UI71_ADMIN_SHELL_GO`
- `UI71_FEATURE_BOUNDARIES_GO`
- `UI71_QUERY_OWNERSHIP_GO`
- `UI71_INVALIDATION_GO`
- `UI71_RBAC_PRESERVATION_GO`
- `UI71_CSRF_PRESERVATION_GO`
- `UI71_FORM_OWNERSHIP_GO`
- `UI71_LEGACY_CLEANUP_GO`
- `UI71_ACCESSIBILITY_GO`
- `UI71_RESPONSIVE_INCOMPLETE`
- `UI71_FRONTEND_REGRESSION_GO`
- `UI71_ADMIN_ARCHITECTURE_GO`

Preserved status markers:

- `M555_BACKEND_FREEZE_GO`
- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

## 22. Final decision

`UI71_ADMIN_ARCHITECTURE_GO` per il refactor SRP e per i controlli frontend eseguiti.

Il risultato non autorizza deployment, cutover operativo, modifica di Flask, modifica di Authentik/Traefik, mutation su dati reali o commit/push. L’acceptance autenticata browser e la verifica visuale responsive completa restano attività successive e non sono state dichiarate come passate.
