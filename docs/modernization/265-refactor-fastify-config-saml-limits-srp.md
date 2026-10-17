# Tranche 265 — Fastify configuration SAML limits

## Moduli separati

- `backend/src/config/env-saml-limits.ts`
- `backend/src/config/env.ts`

## Motivazione SRP

I limiti di dimensione per POST SAML, response e relay state formano una
policy autonoma di contenimento dei payload. Sono stati estratti dal loader
generale senza introdurre astrazioni nel servizio SAML.

## Contratti preservati

- Nessun endpoint, response shape, schema SQLite o contratto federativo è stato
  modificato.
- Sono invariati variabili d'ambiente, default, tre campi di `BackendConfig` e
  la validazione `positiveInteger`.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

Restano da valutare le soglie di submission, metriche, score, segreti e backup;
non sono state accorpate perché hanno responsabilità e percorsi di sicurezza
distinti.

## Commit creato

- `refactor(fastify-config): extract SAML limits`

## Prossima tranche

Separare le soglie del flusso submission/review solo dopo aver verificato la
relazione con i controlli di abilitazione già presenti nel loader.
