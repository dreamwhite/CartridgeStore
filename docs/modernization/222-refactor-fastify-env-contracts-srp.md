# Fastify environment contract SRP tranche

## Moduli separati

- `backend/src/config/env-contracts.ts` contiene l’interfaccia pubblica
  `BackendConfig` e i relativi type imports.
- `backend/src/config/env.ts` conserva caricamento, precedenza, parsing e
  validazione delle variabili d’ambiente.
- `env.ts` continua a riesportare `BackendConfig` per compatibilità degli
  import esistenti.

## Motivazione SRP

Il contratto del runtime e la procedura di risoluzione delle env hanno
responsabilità diverse. Separare l’interfaccia riduce il loader senza
introdurre un secondo modello di configurazione.

## Contratti preservati

- Nessuna variabile d’ambiente, default, precedenza o regola fail-closed è
  cambiata.
- Restano invariati i tipi usati da app, route, servizi e test.
- Nessun database, secret, servizio o dato operativo è stato modificato.

## Verifica

- Node.js `24.20.0` — PASS.
- `pnpm --dir backend run typecheck` — PASS.
- `pnpm --dir backend run lint` — PASS.
- `pnpm --dir backend run test` — PASS, 59 file e 295 test.
- `pnpm --dir backend run build` — PASS.
- `git diff --check` — PASS.

## Rischi residui

`loadConfig` resta volutamente un orchestratore unico: raggruppa le policy di
compatibilità tra auth, storage, federation, telemetry e backup. Dividerlo
per dominio richiede mantenere le dipendenze tra validazioni incrociate.

## Commit

- `refactor(fastify-config): extract backend configuration contract`

## Prossima tranche

Continuare l’audit Fastify sui moduli di consistency/storage, estraendo solo
boundary con dipendenze reali e lasciando Flask legacy escluso.
