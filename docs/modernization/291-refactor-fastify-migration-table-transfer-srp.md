# Tranche 291 — Fastify migration table transfer

## Moduli separati

- `backend/src/storage-v2/migration/table-transfer.ts`
- `backend/src/storage-v2/migration/executor.ts`

## Motivazione SRP

`migration/executor.ts` conteneva anche l’algoritmo generico di trasferimento
idempotente delle tabelle compatibili. La lettura delle colonne, la risoluzione
delle chiavi primarie, il confronto dei valori e la gestione dei conflitti sono
stati estratti in un modulo dedicato; l’executor resta responsabile del
workflow di migrazione per dominio.

## Contratti preservati

- Sono invariati mapping compatibili, ordine delle righe, idempotenza e codici
  errore di conflitto/trasferimento.
- Non sono cambiati schema SQLite, journal di migrazione, autorizzazioni,
  endpoint o contratti firmware.
- Flask legacy è stato lasciato intatto.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- controllo righe lunghe del nuovo modulo — PASS
- `git diff --check` — PASS

## Rischi residui

L’executor conserva il coordinamento delle fasi e dei checkpoint perché il loro
ordine determina la ripresa sicura. Il nuovo helper non introduce transazioni
o policy di migrazione aggiuntive.

## Commit

- `refactor(fastify-storage): extract migration table transfer`

## Prossima tranche

Continuare l’audit dei moduli storage-v2 e dei servizi applicativi residui,
privilegiando confini che isolino responsabilità di dominio verificabili.
