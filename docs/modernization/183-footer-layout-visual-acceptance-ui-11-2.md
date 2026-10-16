# UI.11.2 — Footer Layout Correction & Visual Acceptance

## 1. Executive summary.

UI.11.2 è completata con decisione `UI112_FOOTER_VISUAL_ACCEPTANCE_GO`.

Il footer è stato riportato alla composizione richiesta a tre colonne: identità PRG32, sezione EXPLORE e sezione PROJECT. I link sono ora blocchi verticali con spaziatura verificata tramite geometria browser reale. Sono state preservate attribuzione a Parthenope, Documentation, repository GitHub ufficiale e licenza MIT.

Il sticky header, gli anchor offset e il resto dell'applicazione non sono stati modificati.

## 2. Scope and safety boundaries.

Sono stati modificati solo il componente footer, i test focalizzati, le asserzioni footer dei test browser e questo report. Non sono stati modificati Fastify, Flask, SQLite, Docker, Compose, Traefik, Authentik, autenticazione, dati operativi o routing di produzione.

Le verifiche browser hanno usato il runtime full-stack disposable già esistente. Non sono stati usati credenziali reali, servizi condivisi o provider federati. Non sono stati eseguiti commit o push.

## 3. Starting footer inventory.

Prima della modifica `SiteFooter` aveva due soli gruppi: identità/attribuzione e link Documentation/GitHub. I link pubblici Explore, Leaderboards e Statistics erano stati rimossi dal footer in UI.11.1, mentre continuavano a essere disponibili nella navigazione primaria.

Il test unitario vietava esplicitamente i link Explore, Leaderboards e Statistics nel footer; il test pubblico verificava la stessa composizione ridotta. Queste asserzioni erano incompatibili con la direzione visuale richiesta da UI.11.2.

## 4. Original UI.11 design reference.

La direzione di riferimento è:

```text
PROJECT IDENTITY | EXPLORE | PROJECT
```

L'implementazione UI.11.2 ripristina il concetto, ma non i difetti di spacing dell'implementazione precedente. La griglia usa proporzioni diverse per densità dei contenuti invece di tre colonne uguali.

## 5. UI.11.1 visual shortcomings.

La composizione a due livelli di UI.11.1 era tecnicamente corretta ma non soddisfaceva la preferenza visuale: mancava una sezione EXPLORE dedicata e la navigazione utile risultava concentrata in una singola riga di link. UI.11.2 corregge la composizione senza riaprire il lavoro sullo sticky header.

## 6. Final footer information architecture.

La struttura finale è:

1. colonna identità: PRG32, descrizione compatta, università e appartenenza di Cartridge Store all'ecosistema;
2. colonna EXPLORE: Explore, Leaderboards, Statistics;
3. colonna PROJECT: GitHub e Documentation;
4. riga secondaria separata: nome ufficiale dell'università a sinistra e `Open source · MIT License` a destra.

Decisione: `UI112_FOOTER_STRUCTURE_GO`.

## 7. Three-column grid implementation.

Il layout usa CSS Grid e token Tailwind già presenti:

```text
mobile: una colonna impilata
md+: minmax(0, 2fr) / minmax(9rem, 1fr) / minmax(9rem, 1fr)
```

La prima colonna riceve più spazio per evitare wrapping innaturale; le colonne di navigazione hanno una larghezza minima sufficiente per `Leaderboards` e `Documentation`. Le tre sezioni sono sibling diretti della stessa griglia e non usano `col-span`; non sono state introdotte larghezze assolute o altezze fisse.

## 8. Project identity and university.

La colonna identità mostra:

- `PRG32`;
- `An open-source educational RISC-V platform for learning assembly and C.`;
- `A project of the University of Naples Parthenope.`;
- `Cartridge Store is part of the PRG32 project ecosystem.`

La riga secondaria conserva il nome ufficiale `Università degli Studi di Napoli Parthenope`.

Decisione: `UI112_INSTITUTIONAL_ATTRIBUTION_GO`.

## 9. EXPLORE navigation.

È stata ripristinata la heading `EXPLORE` e una navigation semantica `Explore footer links` con link distinti:

- `Explore` → `/explore`;
- `Leaderboards` → `/scores`;
- `Statistics` → `/stats`.

I link sono elementi separati in una colonna flex verticale con gap esplicito.

Decisione: `UI112_EXPLORE_NAVIGATION_GO`.

## 10. PROJECT links.

È stata aggiunta la heading `PROJECT` e una navigation semantica `Project footer links` con:

- `GitHub` → `https://github.com/riscv-prg32/PRG32`;
- `Documentation` → `/docs`.

Il link GitHub usa `target="_blank"` e `rel="noopener noreferrer"`. Non sono stati inventati link sociali o repository diversi.

Decisione: `UI112_PROJECT_LINKS_GO`.

## 11. Institutional secondary row.

La riga secondaria è separata dalla griglia primaria da un bordo sottile e usa layout colonna su mobile e distribuzione sinistra/destra da `sm` in poi. Il testo istituzionale resta visibile anche nel layout mobile.

## 12. License presentation.

La licenza verificata è mantenuta esattamente come `Open source · MIT License`. Non è stato aggiunto un copyright non verificato né un claim legale ulteriore.

## 13. Desktop visual inspection.

Sono state catturate e ispezionate le schermate:

- `/tmp/prg32-ui11-desktop-light.png`;
- `/tmp/prg32-ui11-desktop-dark.png`.

A `1440px` il footer mostra chiaramente le tre colonne sulla stessa riga, con prima colonna più ampia e colonne di navigazione allineate. Le etichette non si sovrappongono, i link sono verticalmente separati e la riga istituzionale è distinta senza creare spazio vuoto sproporzionato.

Decisione: `UI112_DESKTOP_VISUAL_GO`.

## 14. Mobile visual inspection.

Sono state catturate e ispezionate:

- `/tmp/prg32-ui11-mobile-light.png`;
- `/tmp/prg32-ui11-mobile-dark.png`.

A `375px` la griglia si impila in modo leggibile: identità in alto, EXPLORE e PROJECT successivamente, riga istituzionale in chiusura. Nessun contenuto del footer è nascosto e non è presente overflow orizzontale.

Decisione: `UI112_MOBILE_VISUAL_GO`.

## 15. Light/dark inspection.

Le quattro catture sono state ispezionate in entrambi i temi. I token di superficie, testo, muted text, bordo e focus restano coerenti con il design system; attribution e licenza sono leggibili sia in light sia in dark.

Decisione: `UI112_LIGHT_DARK_GO`.

## 16. Link spacing geometry.

Il test browser non si limita a verificare classi o presenza dei link. Per ogni combinazione responsive acquisisce i bounding box dei link EXPLORE e verifica:

- tre elementi distinti;
- `next.top > previous.bottom` per ogni coppia adiacente;
- nessuna concatenazione visiva verticale;
- nessun overflow documentale.

La stessa suite controlla anche la raggiungibilità dei link a mobile. Risultato: `10/10` combinazioni responsive con geometria valida.

Decisione: `UI112_LINK_SPACING_GO`.

## 17. Responsive matrix.

Sono state eseguite tutte le 10 combinazioni richieste:

| Viewport | Light | Dark |
| ---: | :---: | :---: |
| 375px | PASS | PASS |
| 768px | PASS | PASS |
| 1024px | PASS | PASS |
| 1440px | PASS | PASS |
| 1920px | PASS | PASS |

Risultato complessivo: `10/10 PASS`, inclusa la cattura ripetuta dopo la correzione finale della griglia. Sono stati verificati footer presente, heading, link, geometria, visibilità attribution/licenza e assenza di overflow.

Decisione: `UI112_RESPONSIVE_GO`.

## 18. Accessibility.

Il footer usa `footer`, heading `h2`, due landmark `nav` con nomi accessibili distinti e link nativi keyboard-reachable. Ogni link ha un nome chiaro; il simbolo esterno è `aria-hidden`; il link GitHub conserva gli attributi di sicurezza. I test unitari verificano cinque link distinti e le destinazioni.

Non viene dichiarata certificazione WCAG.

Decisione: `UI112_ACCESSIBILITY_GO`.

## 19. Public browser regression.

Comando eseguito con Node.js 24:

```text
PRG32_E2E_FULLSTACK=1 PRG32_E2E_BASE_URL=http://127.0.0.1:3159 PRG32_UI92_BACKEND_PORT=5159 PRG32_UI92_FRONTEND_PORT=3159 PRG32_E2E_WEB_SERVER='node scripts/serve-fullstack-disposable.mjs' pnpm exec playwright test --project=public-smoke -c playwright.config.mjs
```

Risultato: `11/11 PASS`.

La suite include route pubbliche, tastiera, footer responsive, sticky header, anchor Explore, catalogo, error states e smoke tests.

Decisione: `UI112_PUBLIC_REGRESSION_GO`.

## 20. Full-stack regression.

Comando eseguito contro il backend Fastify e Next.js disposable:

```text
PRG32_E2E_FULLSTACK=1 PRG32_E2E_BASE_URL=http://127.0.0.1:3160 PRG32_UI92_BACKEND_PORT=5160 PRG32_UI92_FRONTEND_PORT=3160 PRG32_E2E_WEB_SERVER='node scripts/serve-fullstack-disposable.mjs' pnpm exec playwright test --project=fullstack-disposable -c playwright.config.mjs
```

Risultato: `3/3 PASS`.

Decisione: `UI112_FULLSTACK_REGRESSION_GO`.

## 21. Authenticated regression.

Il primo run autenticato ha evidenziato una sola asserzione obsoleta nel test UI.11: cercava il vecchio accessible name `PRG32 on GitHub`. Il componente era corretto secondo il nuovo brief; il test è stato aggiornato a verificare il link GitHub del PROJECT group senza cambiare autenticazione o backend.

Rerun eseguito:

```text
PRG32_E2E_AUTH_DISPOSABLE=1 PRG32_UI93_AUTHENTICATED=1 PRG32_UI93_BACKEND_URL=http://127.0.0.1:5162 PRG32_UI93_TEST_BOOTSTRAP_TOKEN=ui93-disposable-bootstrap-token-2026 PRG32_E2E_BASE_URL=http://localhost:3162 PRG32_UI92_BACKEND_PORT=5162 PRG32_UI92_FRONTEND_PORT=3162 PRG32_E2E_WEB_SERVER='node scripts/serve-fullstack-disposable.mjs' pnpm exec playwright test --project=authenticated-disposable -c playwright.config.mjs --grep-invert 'UI.9.3.1|UI931'
```

Risultato finale: `7/7 PASS`. Sono rimasti coperti sessione, CSRF, RBAC, account menu, creator/review workflow, responsive authenticated surfaces e password mutation.

Decisione: `UI112_AUTH_REGRESSION_GO`.

## 22. Sticky-header preservation.

`AppShell.tsx` non è stato modificato. Restano invariati `sticky top-0 z-40`, stacking, mobile menu, theme toggle, `scroll-padding-top` e `scroll-margin-top` introdotti e verificati in UI.11.1.

Il test pubblico sticky/anchor è passato dentro la regressione `11/11`. Decisione: `UI112_STICKY_HEADER_PRESERVED_GO`.

## 23. Validation commands/results.

Con Node.js 24 selezionato tramite `nvm use 24`:

```text
pnpm run typecheck   PASS
pnpm run lint        PASS
pnpm run test        PASS — 50 file, 113 test
pnpm run build       PASS — Next.js 16.4.0, 40 pagine statiche
git diff --check     PASS
```

Test mirato:

```text
pnpm exec vitest run src/components/layout/SiteFooter.test.tsx
PASS — 1 file, 3 test
```

Decisione: `UI112_FRONTEND_VALIDATION_GO`.

## 24. Files changed.

File pertinenti al milestone:

- `frontend/src/components/layout/SiteFooter.tsx`;
- `frontend/src/components/layout/SiteFooter.test.tsx`;
- `frontend/e2e/public-acceptance.spec.mjs`;
- `frontend/e2e/authenticated-disposable.spec.mjs`;
- `docs/modernization/183-footer-layout-visual-acceptance-ui-11-2.md`.

Non sono stati modificati `AppShell.tsx`, `navigation.ts`, `index.css` o altri file applicativi fuori dal footer e dai test direttamente collegati.

## 25. Blocked/unverified checks.

Non risultano gate UI.11.2 bloccati. Non sono state verificate modifiche operative a Docker, Traefik, Authentik o deployment production perché esplicitamente fuori scope. La suite UI.9.3.1 non è stata rieseguita in questo milestone: la regressione autenticata standard `7/7` e il comportamento sticky sono passati; l'evidenza UI.9.3.1 precedente resta invariata.

Durante l'accettazione visuale è stata applicata una correzione finale al breakpoint della griglia dopo aver rilevato un rendering con identità su riga separata: rimosso lo span responsive e anticipata la griglia a tre colonne da `md`. La cattura desktop e la matrice responsive sono state rieseguite dopo la correzione.

I warning del runtime disposable (`NO_COLOR` e `MODULE_TYPELESS_PACKAGE_JSON`) sono rimasti non bloccanti e non hanno prodotto errori browser.

## 26. Remaining visual debt.

Resta soltanto eventuale rifinitura futura di copy o tipografia istituzionale. Non rimangono difetti riprodotti di sovrapposizione, concatenazione dei link, overflow o squilibrio della griglia nel perimetro verificato.

## 27. Final decision.

Decision markers:

```text
UI112_FOOTER_STRUCTURE_GO
UI112_EXPLORE_NAVIGATION_GO
UI112_PROJECT_LINKS_GO
UI112_INSTITUTIONAL_ATTRIBUTION_GO
UI112_LINK_SPACING_GO
UI112_DESKTOP_VISUAL_GO
UI112_MOBILE_VISUAL_GO
UI112_LIGHT_DARK_GO
UI112_RESPONSIVE_GO
UI112_ACCESSIBILITY_GO
UI112_STICKY_HEADER_PRESERVED_GO
UI112_PUBLIC_REGRESSION_GO
UI112_FULLSTACK_REGRESSION_GO
UI112_AUTH_REGRESSION_GO
UI112_FRONTEND_VALIDATION_GO
```

Decisione finale: `UI112_FOOTER_VISUAL_ACCEPTANCE_GO`.

Gate preservati:

```text
UI111_STICKY_HEADER_GO
UI111_HEADER_STACKING_GO
UI111_ANCHOR_OFFSET_GO
UI10_NAVIGATION_POLISH_GO
M555_BACKEND_FREEZE_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

UI.11.2 si arresta qui: nessun backend change, nessuna modifica infrastrutturale, nessun cutover, nessun commit e nessun push.
