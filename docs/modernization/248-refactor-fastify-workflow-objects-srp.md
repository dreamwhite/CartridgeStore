# Tranche 248 — Canonical workflow object promotion

## Moduli separati

- `backend/src/storage-v2/workflow-objects.ts`
  - canonical object plan type;
  - promoted-object verification;
  - staged-object promotion, durable linking and SQLite state update.
- `backend/src/storage-v2/workflow.ts`
  - mantiene l'orchestrazione del workflow e delega l'object storage adapter.

## Motivazione SRP

La verifica dell'identità dei file e la promozione atomica degli oggetti erano
incorporate nel servizio che coordina submission, review, journal e visibility.
Il nuovo adapter concentra il confine filesystem/SQLite relativo a un singolo
oggetto, lasciando al workflow la responsabilità delle transizioni di dominio.

## Contratti preservati

- storage key, hash, dimensione, media type e object state invariati;
- verifiche di traversal, symlink, conflitto, integrità e fsync invariate;
- messaggi e codici degli errori di pubblicazione invariati;
- schema SQLite, journal, endpoint e autorizzazioni invariati;
- nessuna modifica ai contratti firmware o ai dati operativi.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe lunghe sul nuovo adapter — PASS.

## Rischi residui

Il servizio workflow conserva ancora la materializzazione dei payload e le
transizioni del journal, che saranno valutate separatamente per evitare confini
artificiali o modifiche al protocollo di pubblicazione.

## Commit creati

- `refactor(fastify-workflow): extract object promotion adapter`

## Prossima tranche

Analizzare la materializzazione dei payload del workflow canonico e separarla
solo se il confine resta indipendente dall'orchestrazione delle transizioni.
