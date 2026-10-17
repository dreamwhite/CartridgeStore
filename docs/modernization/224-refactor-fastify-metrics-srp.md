# Fastify metrics SRP tranche

## Moduli separati

- `backend/src/metrics/contracts.ts` contiene i contratti di run, sample,
  summary, database source e opzioni del servizio.
- `backend/src/metrics/codecs.ts` contiene normalizzazione dei payload,
  adattamento delle righe SQLite, controllo di ownership, aggregazioni e
  formattazione dei report.
- `backend/src/metrics/service.ts` conserva feature gate, transazioni SQLite,
  autorizzazione applicata alle operazioni e serializzazione degli export.
- `service.ts` riesporta i contratti e `summarizeSamples` per compatibilità
  degli import esistenti.

## Motivazione SRP

I contratti e le trasformazioni pure non devono conoscere la transazione o la
connessione SQLite. Il servizio rimane il confine applicativo responsabile di
scrittura, lettura e export, mentre codec e aggregazioni sono riutilizzabili e
verificabili separatamente.

## Contratti preservati

- Nessun endpoint, response shape, query, schema SQLite o limite è cambiato.
- Sono invariati coercizione dei valori, calcolo delle statistiche, regole di
  ownership e formato CSV/Markdown.
- Gli import pubblici dal modulo `metrics/service.ts` restano disponibili.
- Nessuna autenticazione, autorizzazione o dato operativo è stato modificato.

## Verifica

- Node.js `24.20.0` — PASS.
- `pnpm --dir backend run typecheck` — PASS.
- `pnpm --dir backend run lint` — PASS.
- `pnpm --dir backend run test` — PASS, 59 file e 295 test.
- `pnpm --dir backend run build` — PASS.
- `git diff --check` — PASS.
- I nuovi moduli non contengono righe oltre 100 caratteri.

## Rischi residui

Le operazioni di batch e completamento restano nel servizio perché il loro
confine corretto include transazioni, idempotenza canonical e fault injection.

## Commit

- `refactor(fastify-metrics): extract contracts and codecs`

## Prossima tranche

Continuare l’audit dei residui Fastify e delle superfici CLI/frontend non
ancora separate, senza intervenire sul Flask legacy escluso.
