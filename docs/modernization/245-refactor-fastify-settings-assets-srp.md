# Tranche 245 — Managed settings assets

## Moduli separati

- `backend/src/settings/errors.ts`
  - definisce l'errore condiviso del dominio settings.
- `backend/src/settings/asset-store.ts`
  - risoluzione degli asset pubblicati e compatibilità con gli URL legacy;
  - validazione, staging, fsync e pubblicazione atomica degli asset;
  - aggiornamento transazionale del riferimento SQLite e cleanup best effort.
- `backend/src/settings/service.ts`
  - mantiene il servizio settings, il contratto pubblico e delega gli asset.

## Motivazione SRP

La gestione filesystem di logo e favicon era incorporata nel servizio che
gestisce anche configurazione applicativa, SMTP, versioni e audit. Il nuovo
adapter isola la responsabilità asset senza duplicare le regole già presenti
nel dominio settings.

## Contratti preservati

- metodi pubblici `assetPath` e `replaceAsset` invariati;
- URL `/api/assets`, URL legacy `/static/custom`, MIME, estensioni e limite
  dimensionale invariati;
- fault point, staging, fsync, transazione SQLite e cleanup invariati;
- `SettingsError` continua a essere esportato dal modulo service;
- nessuna modifica a endpoint, autorizzazioni, schema o contratti firmware.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe lunghe sui nuovi moduli — PASS.

## Rischi residui

`settings/service.ts` conserva la gestione dei valori applicativi, SMTP,
versioning e audit. Il nuovo asset store non modifica dati operativi oltre al
riferimento settings già previsto dal contratto.

Il refactor Flask legacy è escluso su decisione del progetto perché il codice
è transitorio e destinato alla rimozione.

## Commit creati

Da creare dopo la verifica finale della tranche:

- `refactor(fastify-settings): extract managed asset store`

## Prossima tranche

Proseguire l’analisi del backend residuo e poi rieseguire la validazione
frontend completa prima del report globale; Flask legacy resta escluso.
