# PRG32 Cartridge Store — UI.10 Navigation & Final Frontend Polish

## 1. Executive summary

UI.10 è stata implementata e verificata sul frontend Next.js senza modificare
Fastify, Flask, SQLite, Docker, Compose o l'infrastruttura condivisa.

La navigazione pubblica ora espone esattamente Explore, Leaderboards,
Statistics e Documentation. La ricerca resta disponibile all'interno di
Explore. Il selettore tema è compatto e accessibile, l'accesso anonimo è più
visibile e l'area autenticata usa il menu account esistente con destinazioni
derivate dalle permission restituite dal backend.

Decisione finale: **UI10_NAVIGATION_POLISH_GO**.

Restano invariati i vincoli di progetto:

- `M555_BACKEND_FREEZE_GO`
- `UI931_AUTH_SECURITY_COMPLETION_GO`
- `UI932_PUBLIC_RESPONSIVE_CLOSURE_GO`
- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

## 2. Scope e safety boundaries

Sono stati modificati soltanto componenti, test e configurazione frontend
necessari alla navigazione e alla sua verifica. Non sono state effettuate
modifiche a backend, schema dati, autenticazione server-side, Dockerfile,
Compose, Traefik, Authentik, DNS/TLS o dati operativi.

I test browser hanno usato esclusivamente i disposable harnesses già presenti.
Nessun account reale, servizio Authentik reale o volume operativo è stato
utilizzato.

## 3. Starting navigation inventory

Prima di UI.10 l'header pubblico conteneva:

- Explore
- Search
- Documentation
- theme toggle
- Sign in

La ricerca era già implementata nel catalogo Explore e non richiedeva una
route pubblica separata.

## 4. Previous IA

La precedente voce Search duplicava l'accesso a una capacità già disponibile
nel catalogo. La navigazione autenticata aveva già le destinazioni account,
creator, review e administration, ma il logout era esposto come azione
separata anziché come voce del menu account.

## 5. New public navigation

La costante `PUBLIC_NAVIGATION` contiene ora esattamente:

| Label | Path |
| --- | --- |
| Explore | `/explore` |
| Leaderboards | `/scores` |
| Statistics | `/stats` |
| Documentation | `/docs` |

Non esiste più una voce primaria Search.

Decisione: **UI10_NAVIGATION_STRUCTURE_GO**.

## 6. Search consolidation

La ricerca resta nel catalogo di `/explore`, con il comportamento e i
parametri URL esistenti. Sono stati verificati l'assenza di una voce Search
standalone e l'accessibilità della ricerca dentro Explore.

Decisione: **UI10_SEARCH_CONSOLIDATION_GO**.

## 7. Desktop header

Il desktop header presenta quattro link primari, con `aria-current="page"`
sulla route attiva. Il layout conserva il gutter e il comportamento
responsive esistenti; non sono state introdotte nuove route o nuove regole di
business.

Decisione: **UI10_DESKTOP_HEADER_GO**.

## 8. Brand e active route

Il brand continua a puntare alla home esistente. L'indicazione della route
attiva viene resa sul link corrispondente senza modificare il routing Next.js.
La verifica browser ha controllato href, label, focus e `aria-current`.

## 9. Theme

`ThemeToggle` è stato ridotto a un controllo icon-only di dimensione compatta.
Conserva:

- label accessibile e `title` dinamico;
- `aria-pressed` coerente con il tema corrente;
- attivazione da tastiera tramite il normale elemento button;
- persistenza tramite il provider tema esistente;
- icona Sun/Moon coerente con l'azione proposta.

Decisione: **UI10_THEME_CONTROL_GO**.

## 10. Anonymous sign-in

Per utenti anonimi Sign in è ora un bottone primario compatto, più prominente
del theme toggle, e continua a puntare a `/login`.

Decisione: **UI10_ANONYMOUS_ENTRY_GO**.

## 11. Authenticated account menu

Per utenti autenticati l'header usa il `DropdownMenu` Radix già presente.
Il trigger espone un nome accessibile derivato dall'utente corrente. Il menu
contiene le destinazioni disponibili e la voce Sign out; non è stato creato un
secondo auth store e non sono state replicate decisioni di autorizzazione del
backend.

Decisione: **UI10_AUTHENTICATED_MENU_GO**.

## 12. Permission-aware destinations

La visibilità di Creator Studio, Review queue, Administration, Federation e
Public profile continua a dipendere dalle permission dell'utente corrente,
restituite da Fastify. Non vengono usati username o ruoli hard-coded.

È stata corretta anche la lista frontend delle permission amministrative:
`catalog:metadata:write` non viene più trattata come permission esclusiva
admin, perché il contratto backend la assegna anche al gruppo editor.

Il test browser interroga le permission reali di quattro identità disposable e
confronta la visibilità del menu con il contratto osservato.

Decisione: **UI10_PERMISSION_AWARENESS_GO**.

## 13. Logout

Sign out è stato integrato nel menu account e continua a usare la mutation di
logout e il cleanup privato già esistenti. Dopo il logout il router porta
l'utente alla destinazione pubblica prevista e le query private vengono
invalidate/rimosse secondo il comportamento consolidato precedente.

Decisione: **UI10_LOGOUT_INTEGRATION_GO**.

## 14. Mobile navigation

La navigazione mobile usa i primitivi Radix Dialog già disponibili nel
progetto. Il pannello è controllato, ha titolo e descrizione accessibili e
chiude quando:

- si preme Escape;
- si seleziona una destinazione;
- si attiva il normale comportamento di chiusura del dialog.

Radix gestisce focus trapping e restituzione del focus al trigger. È stata
verificata l'assenza di overflow orizzontale nel controllo autenticato mobile.

Decisione: **UI10_MOBILE_NAVIGATION_GO**.

## 15. Keyboard e accessibility

Le verifiche hanno coperto:

- focus dei link primari;
- focus sul trigger mobile;
- apertura/chiusura con tastiera;
- ritorno del focus dopo Escape;
- `aria-current` della route attiva;
- label accessibili per theme toggle, mobile trigger e account menu;
- menuitem Sign out accessibile;
- messaggi di stato logout già esistenti.

Non viene dichiarata certificazione WCAG. La decisione riguarda soltanto le
regressioni verificate in questo milestone.

Decisione: **UI10_ACCESSIBILITY_GO**.

## 16. Responsive viewport/theme matrix

La suite public acceptance esistente esegue la matrice di route pubbliche su
5 viewport e 2 temi, quindi 10 combinazioni width/theme:

| Viewport | Light | Dark |
| ---: | :---: | :---: |
| 375 | PASS | PASS |
| 768 | PASS | PASS |
| 1024 | PASS | PASS |
| 1440 | PASS | PASS |
| 1920 | PASS | PASS |

Il test UI.10 focalizzato sull'header verifica inoltre desktop a 1280px e
mobile a 375px, inclusi apertura dialog, Escape, focus return e navigazione.
La suite UI.9.3.1 ha già eseguito la matrice autenticata 5 workspace × 5
viewport × 2 temi = 50/50.

Decisione: **UI10_RESPONSIVE_GO**.

## 17. Authenticated navigation acceptance

Il test authenticated disposable usa quattro identità sintetiche e controlla
il menu su mobile a 375px; verifica inoltre l'header admin desktop a 1440px.
Le permission osservate vengono lette dall'endpoint reale `/api/auth/me`.
La suite UI.9.3.1 completa ha inoltre passato 6/6 test, compresa la matrice
responsive autenticata 50/50.

Decisione: **UI10_AUTHENTICATED_MENU_GO**.

## 18. ESLint generated-output ignores

`frontend/eslint.config.mjs` ignora soltanto gli output disposable aggiuntivi
necessari al harness:

- `.next-ui92/**`
- `.next-ui93/**`

Restano gli ignore già presenti per `.next/**`, `out/**`, `coverage/**` e
`next-env.d.ts`. Non è stato introdotto un ignore globale indiscriminato.

Decisione: **UI10_ESLINT_IGNORE_GO**.

## 19. Frontend defects found/fixed

Sono stati risolti questi difetti riprodotti:

1. La navigazione pubblica mostrava Search come voce primaria e non esponeva
   Leaderboards/Statistics.
2. Il mobile header usava una gestione condizionale custom senza il focus
   management completo già disponibile nei primitivi Radix.
3. Il logout era separato dal menu account.
4. La permission condivisa `catalog:metadata:write` rendeva erroneamente
   amministrativo un utente editor.
5. Il theme toggle esponeva testo duplicato e non dichiarava lo stato pressed.

È stato aggiunto coverage unitario e browser per ogni correzione. Non sono
state apportate modifiche speculative ad altre feature.

## 20. Browser observations

Le osservazioni browser sono state eseguite su harness disposable e con basso
numero di richieste. Le suite hanno verificato DOM, URL, focus, menu e stato
di navigazione; non sono state catturate screenshot.

La prima esecuzione UI.9.3.1 con base URL `127.0.0.1` ha bloccato il test
WebAuthn perché il disposable harness configura gli origin WebAuthn su
`http://localhost:<port>`. La riesecuzione corretta con
`http://localhost:<port>` ha passato il test reale virtual-authenticator e
l'intera suite UI.9.3.1. Questo è un vincolo di invocazione del harness, non
una modifica al backend.

Sono rimasti soltanto warning Node già emessi dal runtime disposable sulla
configurazione module type; non sono stati osservati errori applicativi nelle
pagine verificate.

## 21. Validation commands/results

Tutti i comandi sono stati eseguiti con Node.js 24.20.0 tramite `nvm use 24`.

| Check | Command / scenario | Result |
| --- | --- | --- |
| Focused Vitest | `pnpm exec vitest run src/components/layout/navigation.test.ts src/components/layout/AppShell.test.tsx src/components/layout/ThemeToggle.test.tsx src/components/auth/AuthNavigation.test.tsx` | PASS, 4 files / 8 tests |
| Typecheck | `pnpm run typecheck` | PASS |
| ESLint | `pnpm run lint` | PASS |
| Full Vitest | `pnpm run test` | PASS, 49 files / 110 tests |
| Production build | `pnpm run build` | PASS, Next.js 16.4.0, 40 static pages generated |
| Public Playwright | `--project=public-smoke` con full-stack disposable | PASS, 9/9 |
| Full-stack Playwright | `--project=fullstack-disposable` | PASS, 3/3 |
| Authenticated Playwright | `--project=authenticated-disposable --grep-invert UI.9.3.1` | PASS, 7/7 |
| UI.9.3.1 regression | `--project=authenticated-disposable --grep UI931` con origin localhost | PASS, 6/6 |
| Diff validation | `git diff --check` | PASS |

La build ha eseguito typecheck interno, compilazione Turbopack e generazione
delle route Next.js. Gli output disposable `.next-ui92` e `.next-ui93` sono
stati rimossi dal worktree tramite spostamento in `/tmp`; il normale output
Next `.next` resta gestito dagli ignore esistenti.

Decisioni:

- **UI10_PUBLIC_REGRESSION_GO**
- **UI10_FULLSTACK_REGRESSION_GO**
- **UI10_AUTH_REGRESSION_GO**
- **UI10_FRONTEND_VALIDATION_GO**

## 22. Files changed

File frontend modificati:

- `frontend/src/components/layout/navigation.ts`
- `frontend/src/components/layout/ThemeToggle.tsx`
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/components/auth/AuthNavigation.tsx`
- `frontend/eslint.config.mjs`

Test aggiunti o aggiornati:

- `frontend/src/components/layout/navigation.test.ts`
- `frontend/src/components/layout/AppShell.test.tsx`
- `frontend/src/components/layout/ThemeToggle.test.tsx`
- `frontend/src/components/auth/AuthNavigation.test.tsx`
- `frontend/e2e/public-acceptance.spec.mjs`
- `frontend/e2e/authenticated-disposable.spec.mjs`
- `frontend/e2e/authenticated-security-completion.spec.mjs`

Questo report è l'unico nuovo documento Markdown creato per UI.10. Nessun
roadmap document è stato aggiornato.

## 23. Blocked/unverified checks

Non sono state bloccate verifiche necessarie all'accettazione UI. Restano
esplicitamente fuori scope:

- autenticazione/federation Authentik OIDC/SAML reale;
- test su hardware WebAuthn fisico;
- certificazione WCAG o audit visuale completo;
- cutover operativo, routing pubblico e retirement di Flask;
- verifica su dati o volumi operativi;
- screenshot visuali dedicati.

L'esecuzione WebAuthn resta verificata come virtual authenticator Chromium nel
disposable runtime e non costituisce prova di compatibilità con ogni hardware
fisico o con la configurazione produttiva.

## 24. Remaining frontend debt

Il debito residuo non impedisce UI.10 ma resta da gestire in milestone
successive:

- mantenere allineati i test browser ai contratti di permission backend;
- aggiungere eventualmente visual regression tooling solo se autorizzato e
  necessario;
- separare in futuro eventuali warning module-type del disposable harness;
- mantenere i test authenticated opt-in e i loro prerequisiti di origin;
- completare eventuali verifiche di accessibilità formali senza dichiarare
  certificazione prematura.

## 25. Final decision

Decision markers UI.10:

- `UI10_NAVIGATION_STRUCTURE_GO`
- `UI10_SEARCH_CONSOLIDATION_GO`
- `UI10_DESKTOP_HEADER_GO`
- `UI10_THEME_CONTROL_GO`
- `UI10_ANONYMOUS_ENTRY_GO`
- `UI10_AUTHENTICATED_MENU_GO`
- `UI10_PERMISSION_AWARENESS_GO`
- `UI10_LOGOUT_INTEGRATION_GO`
- `UI10_MOBILE_NAVIGATION_GO`
- `UI10_ACCESSIBILITY_GO`
- `UI10_RESPONSIVE_GO`
- `UI10_ESLINT_IGNORE_GO`
- `UI10_PUBLIC_REGRESSION_GO`
- `UI10_FULLSTACK_REGRESSION_GO`
- `UI10_AUTH_REGRESSION_GO`
- `UI10_FRONTEND_VALIDATION_GO`

Finale: **UI10_NAVIGATION_POLISH_GO**.

Questo esito autorizza soltanto la chiusura della rifinitura frontend UI.10.
Non autorizza cutover operativo, rimozione di Flask, modifiche a Docker o
qualsiasi cambiamento all'infrastruttura condivisa.
