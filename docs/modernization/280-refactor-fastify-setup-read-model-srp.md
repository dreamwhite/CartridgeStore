# Tranche 280 — Fastify setup read model

## Moduli separati

- `backend/src/setup/read-model.ts`
- `backend/src/setup/service.ts`

## Motivazione SRP

La costruzione delle risposte pubbliche `status` e `progress` era mescolata a
session enforcement, query SQLite e mutazioni dei passi di installazione. Le
proiezioni sono state isolate in un read model dedicato; il servizio mantiene
il controllo delle sessioni e il ciclo di vita transazionale.

## Contratti preservati

- Sono invariati campi, valori, ordinamento e fallback delle risposte setup
  `status` e `progress`.
- Sono invariati riepiloghi provider senza segreti, CSRF token, stati setup,
  flag readiness, origini pubbliche e dati mDNS.
- Non sono stati modificati sessioni, autorizzazioni, settings, provider,
  audit o schema SQLite.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

Il workflow setup mantiene ancora autorizzazione, bootstrap admin, salvataggio
dei passi, provider, completamento e test SMTP. Queste operazioni restano
legate a stato, audit e session lifecycle.

## Commit creato

- `refactor(fastify-setup): extract setup read model`

## Prossima tranche

Analizzare il servizio backup e i moduli readiness Fastify, mantenendo separati
i percorsi di lettura, validazione e mutazione senza alterare i marker o i
contratti di restore.
