# PRG32 Cartridge Store — UI.11 Institutional Footer & Project Attribution

## 1. Executive summary

UI.11 è stata completata con un footer globale, riusabile e semantico nello
shell Next.js condiviso.

Il footer comunica che Cartridge Store appartiene all'ecosistema PRG32,
attribuisce il progetto alla **Università degli Studi di Napoli Parthenope**,
collega il repository ufficiale e riusa la navigazione pubblica canonica di
UI.10. Il layout è responsive, supporta light/dark tramite i token esistenti
e non modifica backend, autenticazione, route, Docker o infrastruttura.

Decisione finale: **UI11_INSTITUTIONAL_FOOTER_GO**.

## 2. Scope e safety boundaries

Sono stati modificati soltanto il componente footer, l'integrazione minimale
nello shell, i test frontend e questo report.

Non sono stati modificati:

- Fastify, Flask o SQLite;
- Dockerfile, Docker Compose, Traefik o Authentik;
- route pubbliche o private;
- API client, autenticazione o permission backend;
- dati operativi, volumi condivisi o DNS/TLS;
- homepage content architecture.

Le verifiche browser hanno usato i disposable harness esistenti. Non sono
stati usati account reali, servizi Authentik reali o infrastruttura condivisa.

## 3. Starting shell inventory

L'applicazione usa `frontend/src/components/layout/AppShell.tsx` come shell
globale, montato da `frontend/src/app/layout.tsx`. Prima di UI.11 lo shell
conteneva header, navigazione pubblica, theme toggle, autenticazione e il
contenuto della route, ma nessun footer condiviso.

Le singole pagine usano già `main` dove appropriato; per evitare main annidati
il footer è stato aggiunto direttamente nello shell comune.

## 4. Footer placement e architecture

È stato creato un solo componente:

`frontend/src/components/layout/SiteFooter.tsx`

`AppShell` ora usa un layout flex column con contenuto `flex-1` e footer
successivo. Questo garantisce:

- footer naturale in fondo alle pagine brevi;
- footer dopo il contenuto nelle pagine lunghe;
- nessun `position: fixed`;
- nessuna sovrapposizione a dialog o controlli mobile;
- nessun footer duplicato nelle pagine annidate.

Decisione: **UI11_SHELL_INTEGRATION_GO**.

## 5. PRG32 project identity

Il footer mostra:

> PRG32

e descrive il progetto come:

> An open-source educational platform for learning RISC-V assembly and C.

Inoltre dichiara esplicitamente:

> Cartridge Store is part of the PRG32 project ecosystem.

Non è stato introdotto un nuovo brand commerciale, un logo aggiuntivo o una
descrizione promozionale non verificata.

## 6. Institutional attribution

L'attribuzione visibile è:

> A project of the Università degli Studi di Napoli Parthenope.

La relazione istituzionale è quindi comprensibile senza aprire un link
esterno. Non è stato aggiunto un logo universitario e non sono stati inventati
dipartimenti, gruppi di ricerca, sponsor o endorsement.

Decisione: **UI11_INSTITUTIONAL_ATTRIBUTION_GO**.

## 7. Official GitHub repository link

Il footer usa esattamente:

`https://github.com/riscv-prg32/PRG32`

con label accessibile `PRG32 on GitHub`, `target="_blank"` e
`rel="noopener noreferrer"`. Il link è testato sia unitariamente sia in
browser.

Decisione: **UI11_GITHUB_LINK_GO**.

## 8. License/copyright verification

La licenza è stata verificata nel file root `LICENSE` del repository
CartridgeStore e nel repository locale companion `../PRG32`: entrambi
riportano MIT License.

Il footer include quindi soltanto la formulazione verificata:

> Open source under the MIT License.

Non è stata aggiunta una nota copyright automatica. La licenza non è stata
usata come badge decorativo e non sono state aggiunte ulteriori affermazioni
legali.

Non è stato trovato un URL universitario canonico necessario per questa
attribuzione; il testo resta significativo anche senza hyperlink.

## 9. Footer information architecture

Il footer contiene due aree concettuali compatte:

1. Identità: PRG32, descrizione educativa, appartenenza all'ecosistema e
   attribuzione istituzionale.
2. Link: navigazione pubblica e repository ufficiale.

Non contiene newsletter, social link fittizi, form, route private, illustrazioni
o una replica completa dell'header.

## 10. Navigation reuse

I link footer sono generati da `PUBLIC_NAVIGATION` in
`frontend/src/components/layout/navigation.ts`:

| Label | Path |
| --- | --- |
| Explore | `/explore` |
| Leaderboards | `/scores` |
| Statistics | `/stats` |
| Documentation | `/docs` |

Non è stata creata una seconda route map e Search non è stata reintrodotta.

Decisione: **UI11_NAVIGATION_CONSISTENCY_GO**.

## 11. Visual design decisions

Il componente segue il design system esistente:

- `page-gutter` e spacing già presenti;
- superficie, bordo, testo e primary color tramite variabili semantiche;
- tipografia tecnica già usata dal progetto;
- bordo superiore sottile;
- composizione compatta e senza gradienti o animazioni nuove;
- layout orizzontale su desktop e stacking su mobile.

Il footer non altera il contenuto o l'art direction della homepage.

## 12. Light/dark behavior

Il footer usa esclusivamente token come `--color-surface`, `--color-border`,
`--color-text`, `--color-text-muted`, `--color-primary-strong` e
`--color-ring`. Non modifica il provider tema né la persistenza.

La matrice browser ha verificato entrambi i temi e l'ispezione visuale ha
controllato desktop light, desktop dark, mobile light e mobile dark.

Decisione: **UI11_LIGHT_DARK_GO**.

## 13. Responsive viewport/theme matrix

Il test browser `renders one responsive institutional footer across both
themes` ha eseguito tutte le 10 combinazioni richieste:

| Viewport | Light | Dark |
| ---: | :---: | :---: |
| 375px | PASS | PASS |
| 768px | PASS | PASS |
| 1024px | PASS | PASS |
| 1440px | PASS | PASS |
| 1920px | PASS | PASS |

Per ogni cella sono stati verificati footer unico, attribuzione, repository,
footer navigation e assenza di overflow orizzontale.

Decisione: **UI11_RESPONSIVE_GO**.

## 14. Mobile layout acceptance

A 375px il footer si dispone in colonna naturale: identità, attribuzione,
navigazione e repository restano leggibili senza clipping o scroll orizzontale.
I link restano normali controlli testuali raggiungibili da tastiera e touch.

La visual inspection mobile light/dark è stata eseguita su screenshot generati
in `/tmp`; nessun artefatto è stato salvato nel repository.

## 15. Desktop layout acceptance

A 1440px e nelle altre larghezze desktop le aree identità e link sono
bilanciate orizzontalmente, senza competere con il brand dell'header. Il
repository resta chiaramente distinguibile dalla navigazione pubblica.

La visual inspection desktop light/dark ha confermato bordi, contrasto,
allineamento e proporzioni coerenti con il design system esistente.

## 16. Accessibility findings

Sono stati verificati:

- landmark semantico `contentinfo` fornito da `<footer>`;
- landmark `navigation` con label `Footer navigation`;
- link con testo significativo;
- focus visibile tramite il token `--color-ring`;
- ordine di lettura identità → navigazione → repository;
- link GitHub comprensibile anche senza icone;
- comportamento nuovo-tab esplicitato tramite semantica e attributi sicuri.

Non viene dichiarata certificazione WCAG.

Decisione: **UI11_ACCESSIBILITY_GO**.

## 17. Browser visual inspection

Sono stati ispezionati quattro screenshot reali del browser:

- desktop light;
- desktop dark;
- mobile light;
- mobile dark.

L'ispezione ha confermato che il footer segue il contenuto, che la variante
mobile non comprime i link e che i token light/dark restano leggibili.

Durante la prima cattura mobile light era stato fotografato lo `loading`
state della homepage. Il test visuale è stato reso deterministico attendendo
l'heading reale `Build cartridges`; la riesecuzione ha mostrato il contenuto
completo e ha passato il controllo.

Decisione: **UI11_VISUAL_INSPECTION_GO**.

## 18. Public route coverage

Il test footer ha verificato il footer su:

- `/`
- `/explore`
- `/docs`
- `/docs/getting-started`
- `/stats`
- `/login`

Il test fixture pubblico ha verificato inoltre il footer su game detail,
scoreboard, statistics e profilo pubblico. La suite generale continua a
verificare i route pubblici e l'assenza di errori browser non gestiti.

## 19. Authenticated route coverage

Il test authenticated disposable ha verificato il footer nello shell admin a
1440px dopo login reale con Fastify, usando l'identità sintetica
`ui93-admin`. Ha controllato che esista esattamente un `contentinfo` e che il
repository ufficiale sia visibile.

La suite autenticata ha mantenuto il controllo del menu account, delle
permission backend e dell'assenza di overflow a 375px. Non sono state
modificate route guard o workflow.

Decisione: **UI11_AUTH_REGRESSION_GO**.

## 20. Regression results

Le regressioni eseguite dopo l'integrazione sono:

- Public Playwright: **10/10** passati, inclusa la matrice footer 10/10.
- Full-stack disposable Playwright: **3/3** passati.
- Authenticated disposable Playwright: **7/7** passati.
- UI.9.3.1 precedente: preservata come baseline già verificata 6/6.

Decisione: **UI11_PUBLIC_REGRESSION_GO**.

## 21. Validation commands/results

Tutti i comandi frontend sono stati eseguiti con Node.js 24.20.0 tramite
`nvm use 24`.

| Command | Result |
| --- | --- |
| `pnpm run typecheck` | PASS |
| `pnpm run lint` | PASS |
| `pnpm run test` | PASS, 50 file / 112 test |
| `pnpm run build` | PASS, Next.js 16.4.0, 40 pagine static generate |
| `pnpm exec playwright test --project=public-smoke -c playwright.config.mjs` | PASS, 10/10 |
| `pnpm exec playwright test --project=fullstack-disposable -c playwright.config.mjs` | PASS, 3/3 |
| `pnpm exec playwright test --project=authenticated-disposable -c playwright.config.mjs --grep-invert 'UI.9.3.1'` | PASS, 7/7 |
| `git diff --check` | PASS |

Il test footer focalizzato è stato inoltre rieseguito dopo l'ultima estensione
route ed è passato 1/1.

Decisione: **UI11_FRONTEND_VALIDATION_GO**.

## 22. Files changed

Implementazione:

- `frontend/src/components/layout/SiteFooter.tsx` — nuovo footer globale.
- `frontend/src/components/layout/AppShell.tsx` — integrazione nello shell e
  layout flex column.

Test:

- `frontend/src/components/layout/SiteFooter.test.tsx` — coverage identità,
  attribution, link, navigation e comportamento external link.
- `frontend/e2e/public-acceptance.spec.mjs` — matrice responsive, route
  coverage e screenshot visuali opt-in in `/tmp`.
- `frontend/e2e/authenticated-disposable.spec.mjs` — verifica footer nello
  shell autenticato.

Documentazione:

- `docs/modernization/181-institutional-footer-project-attribution-ui-11.md`

Non sono state create altre evidenze Markdown, JSON o CSV e il roadmap non è
stato aggiornato.

## 23. Blocked/unverified checks

Non ci sono blocker UI.11 aperti. Restano fuori scope e quindi non verificati:

- certificazione WCAG formale;
- verifica su hardware o browser non Chromium;
- autenticazione federation OIDC/SAML reale;
- visual regression baseline permanente;
- operatività di produzione, cutover o retirement di Flask;
- modifica o verifica di infrastruttura condivisa.

L'URL universitario non è stato aggiunto perché non era necessario per
un'attribuzione testuale accurata e non è stato introdotto un URL non
verificato.

## 24. Remaining presentation debt

Il debito residuo è limitato a eventuali successive decisioni di branding
istituzionale, qualora venga fornita una fonte ufficiale per un link o un logo
universitario. Non è necessario per il footer corrente.

Restano inoltre le normali verifiche future di accessibilità formale e di
compatibilità con browser aggiuntivi, senza introdurre una nuova dipendenza o
una nuova baseline visuale in questa milestone.

## 25. Final decision

Decision markers:

- `UI11_FOOTER_STRUCTURE_GO`
- `UI11_INSTITUTIONAL_ATTRIBUTION_GO`
- `UI11_GITHUB_LINK_GO`
- `UI11_NAVIGATION_CONSISTENCY_GO`
- `UI11_SHELL_INTEGRATION_GO`
- `UI11_LIGHT_DARK_GO`
- `UI11_RESPONSIVE_GO`
- `UI11_ACCESSIBILITY_GO`
- `UI11_VISUAL_INSPECTION_GO`
- `UI11_PUBLIC_REGRESSION_GO`
- `UI11_AUTH_REGRESSION_GO`
- `UI11_FRONTEND_VALIDATION_GO`

Decisione finale: **UI11_INSTITUTIONAL_FOOTER_GO**.

Baseline preservata:

- `UI10_NAVIGATION_POLISH_GO`
- `UI932_PUBLIC_RESPONSIVE_CLOSURE_GO`
- `UI931_AUTH_SECURITY_COMPLETION_GO`
- `M555_BACKEND_FREEZE_GO`
- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

UI.11 chiude esclusivamente il footer istituzionale frontend. Non autorizza
cutover, rimozione di Flask, modifiche backend o cambiamenti all'infrastruttura
condivisa.
