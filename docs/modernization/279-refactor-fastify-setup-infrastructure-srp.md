# Tranche 279 — Fastify setup infrastructure readiness

## Moduli separati

- `backend/src/setup/infrastructure.ts`
- `backend/src/setup/service.ts`

## Motivazione SRP

`SetupService` calcolava direttamente readiness Fastify, stato del canonical
SQLite, disponibilità writer/secret registry e preferenza applicativa mDNS.
Queste letture infrastrutturali sono state isolate dal workflow dei passi di
installazione e dalle transazioni di bootstrap.

## Contratti preservati

- Sono invariati stati setup, proiezioni di status, flag readiness, origini
  pubbliche e metadati mDNS.
- Sono invariati fallback quando database o tabelle non sono disponibili e la
  gestione fail-safe della preferenza mDNS.
- Non sono stati modificati autorizzazione bootstrap, sessioni, transazioni,
  settings, provider federation o schema SQLite.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

Il servizio setup mantiene ancora session lifecycle, bootstrap admin, salvataggio
provider, completamento e test SMTP. Queste responsabilità coinvolgono stato e
audit e richiedono estrazioni separate.

## Commit creato

- `refactor(fastify-setup): extract infrastructure readiness`

## Prossima tranche

Analizzare il read model `status/progress` e le responsabilità di audit/setup
step, mantenendo invariati sessioni e contratti delle route.
