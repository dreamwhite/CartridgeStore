# Tranche 276 — Fastify storage-v2 workflow visibility

## Moduli separati

- `backend/src/storage-v2/workflow-visibility.ts`
- `backend/src/storage-v2/workflow.ts`

## Motivazione SRP

La transizione da oggetti verificati a visibilità canonica persisteva release,
artifact, media, stato della submission, operation journal ed evento di
visibilità nello stesso servizio del workflow. La responsabilità di
persistenza della visibilità è stata estratta in un adapter dedicato,
mantenendo nel servizio l'orchestrazione e i fault callback.

## Contratti preservati

- Sono invariate query, tabelle, valori di stato, ordine di pubblicazione e
  contenuti di `compatibility_json`.
- Sono invariati idempotenza, gestione del conflitto di versione, rollback
  transazionale e evento `canonical_visibility_committed`.
- Sono invariati i fault boundary `before-visibility` e `after-visibility`.
- Non sono stati modificati endpoint, autorizzazioni, schema SQLite o dati
  operativi.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

La promozione filesystem e la visibilità SQLite restano due fasi distinte del
journal, come richiesto dal recovery design. Non sono state fuse né riordinate.

## Commit creato

- `refactor(fastify-storage): extract workflow visibility`

## Prossima tranche

Analizzare i moduli Fastify residui, con priorità a `federation/provider.ts` e
ai servizi amministrativi/setup, dopo aver verificato i loro confini reali.
