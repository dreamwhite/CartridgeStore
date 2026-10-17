# Tranche 258 — Fastify configuration WebAuthn policy

## Moduli separati

- `backend/src/config/env-webauthn.ts`
- `backend/src/config/env.ts`

## Motivazione SRP

La configurazione WebAuthn contiene parsing, normalizzazione e validazione
della relying party, delle origin autorizzate e dell'allowlist di rete usata
dal setup. Queste regole costituiscono una policy autonoma rispetto al loader
generale della configurazione backend. La policy è stata estratta in un
resolver dedicato, mantenendo `loadConfig` come compositore dei valori finali.

## Contratti preservati

- Nessun endpoint, response shape o schema SQLite è stato modificato.
- Sono rimasti invariati i nomi delle variabili d'ambiente e i valori di
  default.
- Sono rimasti invariati i controlli su writer canonico, RP ID, origin HTTPS,
  modalità test e compatibilità tra origin e RP ID.
- Sono rimasti invariati i messaggi di errore e i valori esposti da
  `BackendConfig`.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

La validazione complessiva di `env.ts` contiene ancora altre policy di
configurazione non separate. Questa tranche non modifica il loro
comportamento.

## Commit creato

- `refactor(fastify-config): extract WebAuthn environment policy`

## Prossima tranche

Analizzare il blocco successivo di configurazione Fastify, separando soltanto
policy con confini reali e mantenendo il barrel pubblico di `env.ts`.
