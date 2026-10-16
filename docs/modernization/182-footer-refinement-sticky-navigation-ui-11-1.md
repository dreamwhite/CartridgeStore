# UI.11.1 — Footer Refinement & Sticky Navigation

## 1. Executive summary.

UI.11.1 è completata con decisione `UI111_FOOTER_STICKY_NAVIGATION_GO`.
Il footer è stato ridotto a una composizione istituzionale compatta a due livelli; l'header globale è ora sticky; gli anchor della pagina Explore rispettano l'altezza dell'header; i flussi pubblici e autenticati sono stati verificati nel browser reale.

Restano invariati i confini già stabiliti: `M555_BACKEND_FREEZE_GO`, `OPERATIONAL_CUTOVER_NO_GO` e `FLASK_RETIREMENT_NO_GO`.

## 2. Scope and safety boundaries.

Sono state modificate soltanto la shell Next.js, il footer, gli stili condivisi, i test frontend e i test Playwright pertinenti. Non sono stati modificati Fastify, Flask, SQLite, Dockerfile, Compose, Traefik, Authentik o routing operativo. Non sono stati eseguiti commit o push.

Le verifiche browser hanno usato esclusivamente i runtime disposable già previsti dai test UI.9.2/UI.9.3; gli output temporanei sono rimasti fuori dal repository.

## 3. Starting implementation inventory.

L'inventario iniziale ha confermato:

- `AppShell` come punto unico per header, contenuto e footer;
- `SiteFooter` come componente condiviso;
- `public-smoke`, `fullstack-disposable` e `authenticated-disposable` come progetti Playwright esistenti;
- query, autenticazione e backend già congelati per questo milestone.

## 4. Reproduced footer visual issues.

Il footer precedente riutilizzava la navigazione pubblica completa, duplicando Explore, Leaderboards e Statistics e aumentando il rumore visivo. La gerarchia istituzionale e l'attribuzione al progetto risultavano meno immediate del necessario.

Il problema è stato riprodotto tramite ispezione del componente e verifica browser sulle route pubbliche. La correzione elimina i link duplicati e mantiene soltanto Documentation e il riferimento ufficiale al repository PRG32.

## 5. Footer information architecture.

La nuova struttura è:

1. riga primaria con nome del progetto, descrizione, contesto Cartridge Store e due link di utilità;
2. riga secondaria con Università degli Studi di Napoli Parthenope e licenza MIT.

Non esiste più un landmark `navigation` interno al footer e non vengono ripetuti i link di navigazione applicativa.

Decisione: `UI111_FOOTER_STRUCTURE_GO`.

## 6. Institutional attribution.

Sono presenti entrambe le informazioni richieste:

- `An open-source educational RISC-V project by the University of Naples Parthenope.`
- `Cartridge Store is part of the PRG32 project ecosystem.`

La riga secondaria espone il nome istituzionale completo. Decisione: `UI111_INSTITUTIONAL_HIERARCHY_GO`.

## 7. GitHub and Documentation links.

Il footer contiene `Documentation` verso `/docs` e `PRG32 on GitHub` verso l'URL esatto `https://github.com/riscv-prg32/PRG32`, con `target="_blank"` e `rel="noopener noreferrer"`. Le verifiche impediscono la ricomparsa di Explore, Leaderboards, Statistics o Search nel footer.

## 8. License presentation.

La licenza è presentata nella riga istituzionale come `Open source · MIT License`, senza aggiungere claim legali o contenuti non presenti nel progetto.

## 9. Footer visual composition.

Il componente usa i token colore e tipografici esistenti, separatori coerenti con la shell, spaziatura compatta `py-6 sm:py-7` e layout flex responsivo. L'ispezione visuale ha mostrato una composizione equilibrata sia in light sia in dark theme.

Decisione: `UI111_FOOTER_VISUAL_GO`.

## 10. Footer responsive matrix.

Il test pubblico esegue 5 larghezze (`375`, `768`, `1024`, `1440`, `1920`) in 2 temi, per 10 combinazioni footer. Risultato: `10/10 PASS`.

## 11. Footer accessibility.

Sono stati mantenuti link semantici, testo leggibile, focus nativo e l'accessibilità del link esterno tramite attributi di sicurezza. Il footer non introduce un landmark di navigazione duplicato. Il test unitario verifica ruolo, destinazioni e attributi dei link.

Decisione: `UI111_FOOTER_ACCESSIBILITY_GO`.

## 12. Footer shell placement.

`AppShell` continua a usare `flex min-h-screen flex-col`, con il contenuto in `flex-1` e il footer dopo il contenuto. Non sono stati introdotti footer duplicati: il test browser verifica un solo `contentinfo` sulle route pubbliche e autenticati verificate.

## 13. Sticky header architecture.

L'header globale resta nella shell condivisa ed è stato reso sticky con `position: sticky`, `top: 0` e `z-40`. Il comportamento non richiede JavaScript, listener di scroll o un secondo stato di navigazione.

Decisione: `UI111_STICKY_HEADER_GO`.

## 14. Sticky header implementation.

La classe applicata è `sticky top-0 z-40`, mantenendo background, bordo, shadow e backdrop già esistenti. Il test unitario di `AppShell` verifica direttamente le classi sticky e lo stacking level.

## 15. Header stacking and overlays.

Il valore `z-40` mantiene l'header sopra il contenuto ordinario e compatibile con il menu mobile esistente. Il test browser apre il menu dopo uno scroll su viewport mobile e verifica che resti utilizzabile.

Decisione: `UI111_HEADER_STACKING_GO`.

## 16. Scroll behavior.

In `html` è stato aggiunto `scroll-padding-top: 5rem`, così lo scrolling documentale tiene conto della shell sticky. Il test desktop verifica che, dopo scroll verticale, l'header resti a `top: 0`.

## 17. Anchor offset behavior.

L'anchor `#catalog-search` usa `scroll-margin-top: 5rem`. Il test apre `/explore#catalog-search`, misura la posizione reale dell'elemento e verifica che il target resti sotto l'header e dentro il viewport.

Decisione: `UI111_ANCHOR_OFFSET_GO`.

## 18. Mobile sticky navigation.

A `375px` il test verifica header sticky sia prima sia dopo lo scroll, apertura del menu mobile, chiusura con `Escape`, ritorno del focus al trigger e assenza di overflow orizzontale.

Decisione: `UI111_MOBILE_NAVIGATION_GO`.

## 19. Authenticated sticky navigation.

Il test authenticated disposable verifica la posizione dell'header dopo scroll per identità ordinary user, creator, reviewer e administrator. Il flusso usa sessioni reali del runtime disposable e non bypassa route guard o RBAC.

Decisione: `UI111_AUTH_NAVIGATION_GO`.

## 20. Visual inspection evidence.

Sono state ispezionate immagini reali generate dal browser:

- `/tmp/prg32-ui11-desktop-light.png`
- `/tmp/prg32-ui11-desktop-dark.png`
- `/tmp/prg32-ui11-mobile-light.png`
- `/tmp/prg32-ui11-mobile-dark.png`
- `/tmp/prg32-ui111-desktop-top.png`
- `/tmp/prg32-ui111-desktop-scrolled.png`
- `/tmp/prg32-ui111-mobile-top.png`
- `/tmp/prg32-ui111-mobile-scrolled.png`

L'ispezione finale ha confermato footer compatto, attribuzione leggibile, link corretti, header sticky e menu mobile non tagliato. Una prima cattura desktop mostrava lo stato di loading perché il test catturava prima del rendering della hero; il test è stato corretto attendendo l'heading stabile e le catture finali sono risultate corrette.

Decisione: `UI111_VISUAL_INSPECTION_GO`.

## 21. Public browser regression.

Comando eseguito con Node.js 24:

```text
PRG32_E2E_FULLSTACK=1 PRG32_E2E_BASE_URL=http://127.0.0.1:3153 PRG32_UI92_BACKEND_PORT=5153 PRG32_UI92_FRONTEND_PORT=3153 PRG32_E2E_WEB_SERVER='node scripts/serve-fullstack-disposable.mjs' pnpm exec playwright test --project=public-smoke -c playwright.config.mjs
```

Risultato: `11/11 PASS`.

Decisione: `UI111_PUBLIC_REGRESSION_GO`.

## 22. Full-stack regression.

Il progetto `fullstack-disposable` è stato eseguito contro backend e Next.js disposable separati.

Risultato: `3/3 PASS`.

Decisione: `UI111_FULLSTACK_REGRESSION_GO`.

## 23. Authenticated regression.

Il progetto `authenticated-disposable` è stato eseguito con il filtro UI.9.3 escluso per la regressione standard.

Risultato: `7/7 PASS`.

La suite UI.9.3.1 è stata inoltre rieseguita con il filtro `UI931` e ha prodotto `6/6 PASS`, inclusa la verifica virtual WebAuthn già esistente.

Decisione: `UI111_AUTH_REGRESSION_GO`.

## 24. Responsive regression.

La matrice footer pubblica è `10/10 PASS` (5 viewport × 2 temi). La regressione authenticated UI.9.3.1 ha confermato `50/50 PASS` per 5 workspace × 5 larghezze × 2 temi. Le verifiche sticky dedicate coprono desktop `1440px` e mobile `375px`, in stato top e dopo scroll.

Decisione: `UI111_FOOTER_RESPONSIVE_GO`.

## 25. Frontend validation.

Con Node.js 24 selezionato tramite `nvm use 24`:

```text
pnpm run typecheck                         PASS
pnpm run lint                              PASS
pnpm run test                              PASS — 50 file, 112 test
pnpm run build                             PASS — Next.js 16.4.0, 40 pagine statiche
git diff --check                           PASS
```

I test unitari mirati di `SiteFooter` e `AppShell` hanno prodotto `2 file / 3 test PASS`. Decisione: `UI111_FRONTEND_VALIDATION_GO`.

## 26. Files changed.

Modifiche direttamente pertinenti:

- `frontend/src/components/layout/SiteFooter.tsx`
- `frontend/src/components/layout/SiteFooter.test.tsx`
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/styles/index.css`
- `frontend/e2e/public-acceptance.spec.mjs`
- `frontend/e2e/authenticated-disposable.spec.mjs`
- `docs/modernization/182-footer-refinement-sticky-navigation-ui-11-1.md`

I due file E2E e il test/footer component risultavano non tracciati nel worktree prima della chiusura di questo milestone e sono stati preservati senza ripulire modifiche preesistenti.

## 27. Blocked/unverified checks.

Non risultano gate UI.11.1 bloccati nelle verifiche autorizzate. Non sono stati verificati né modificati deployment production, Traefik, Authentik, Flask, Fastify, Docker o routing operativo: tali aspetti sono fuori scope e restano coperti dai marker precedenti.

I warning del runtime disposable (`NO_COLOR` e `MODULE_TYPELESS_PACKAGE_JSON`) non hanno causato fallimenti né errori browser e non sono stati trasformati in refactoring non richiesti.

## 28. Remaining presentation debt.

Resta possibile un futuro affinamento tipografico o di copy istituzionale, ma non è necessario per la struttura, accessibilità o comportamento richiesti da UI.11.1. Non sono state introdotte nuove feature di storefront.

## 29. Final decision.

Decision markers:

```text
UI111_FOOTER_STRUCTURE_GO
UI111_INSTITUTIONAL_HIERARCHY_GO
UI111_FOOTER_VISUAL_GO
UI111_FOOTER_RESPONSIVE_GO
UI111_FOOTER_ACCESSIBILITY_GO
UI111_STICKY_HEADER_GO
UI111_HEADER_STACKING_GO
UI111_ANCHOR_OFFSET_GO
UI111_MOBILE_NAVIGATION_GO
UI111_AUTH_NAVIGATION_GO
UI111_VISUAL_INSPECTION_GO
UI111_PUBLIC_REGRESSION_GO
UI111_FULLSTACK_REGRESSION_GO
UI111_AUTH_REGRESSION_GO
UI111_FRONTEND_VALIDATION_GO
```

Decisione finale: `UI111_FOOTER_STICKY_NAVIGATION_GO`.

Questo risultato non autorizza cutover operativo, retirement di Flask, modifiche all'infrastruttura o commit/push.
