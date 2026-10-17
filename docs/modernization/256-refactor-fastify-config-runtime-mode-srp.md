# Tranche 256 — Backend runtime mode policy

## Moduli separati

- `backend/src/config/env-runtime-mode.ts`
  - risoluzione della modalità catalogo;
  - validazione delle modalità canonical/candidate;
  - risoluzione delle autorizzazioni e radici runtime.
- `backend/src/config/env.ts`
  - mantiene la composizione della configurazione completa;
  - mantiene le validazioni incrociate con auth writer, storage, proxy e
    domini applicativi.

## Motivazione SRP

La policy iniziale di selezione runtime era mescolata alla lettura di tutte le
impostazioni backend. Il nuovo modulo concentra solo le decisioni che possono
essere risolte prima dei writer e delle integrazioni, lasciando nel loader le
dipendenze incrociate che richiedono il contesto completo.

## Contratti preservati

- modalità `legacy`, `canonical-disposable`, `canonical-operational` e
  candidate invariati;
- autorizzazioni, default, precedenze e messaggi di errore invariati;
- vincoli production e radici canonical invariati;
- nessuna modifica a API, database, autenticazione o firmware.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS, 59 file e 295 test;
- `pnpm --dir backend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe lunghe sul nuovo modulo — PASS.

## Rischi residui

`env.ts` resta un compositore ampio per la quantità di impostazioni runtime e
per le validazioni incrociate tra domini. Ulteriori estrazioni dovranno
preservare l'ordine di valutazione degli errori.

## Commit creati

- `refactor(fastify-config): extract runtime mode policy`

## Prossima tranche

Analizzare il blocco di configurazione writer/auth/email in `env.ts`, senza
separarlo finché non sia possibile mantenere esplicitamente l'ordine delle
validazioni e dei default.
