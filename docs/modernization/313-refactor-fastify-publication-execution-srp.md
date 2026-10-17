# Tranche 313 — Fastify publication execution SRP

## Moduli separati

- `backend/src/consistency/publication-execution.ts`
  - esecuzione della macchina a stati di pubblicazione;
  - staging e verifica degli artefatti;
  - sostituzione dei file e dell'indice pubblicato;
  - aggiornamento della submission SQLite;
  - completamento, recovery e compensazione.
- `backend/src/consistency/publication.ts`
  - preparazione delle operazioni;
  - validazione delle submission e del catalogo;
  - lock, journal, transizioni e riconciliazione;
  - facciata compatibile per i chiamanti esistenti.

## Motivazione SRP

La preparazione di un'operazione e la sua esecuzione durevole hanno invarianti
diverse. La preparazione costruisce il piano a partire da submission e catalogo;
l'esecutore applica quel piano attraverso gli stati persistiti e i fault point.
Separare questi confini riduce la responsabilità della facciata senza creare
astrazioni estranee al dominio.

## Contratti preservati

- invariati gli endpoint e le response API;
- invariati gli stati, i fault point, il journal e la recovery della pubblicazione;
- invariati schema SQLite, autorizzazioni e autenticazione;
- invariati i percorsi filesystem e i limiti sugli artefatti;
- invariati i contratti firmware e gli ABI PRG32;
- Flask legacy escluso dal refactoring su richiesta esplicita.

## Validazione

Eseguita con Node.js `24.20.0`:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS.

## Rischi residui

La suite Python legacy non è stata eseguita perché `pytest` non è disponibile
nell'ambiente corrente. Non sono state installate dipendenze.

## Commit

- `refactor(fastify-publication): extract execution state machine`

## Prossima tranche

Audit finale dei moduli Fastify residui. Verranno separate altre responsabilità
solo se emergerà un confine di dominio effettivo; i moduli già orchestratori o
coesi resteranno invariati.
