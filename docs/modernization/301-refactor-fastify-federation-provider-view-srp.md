# Tranche 301 — Fastify federation provider safe view

## Moduli separati

- `backend/src/federation/admin-provider-view.ts`
- `backend/src/federation/admin-routes.ts`

## Motivazione SRP

`federation/admin-routes.ts` costruiva direttamente la proiezione pubblica del
provider, inclusi fingerprint dei certificati, validità X.509 e stato delle
transazioni. La trasformazione è stata estratta in un read-model adapter; le
route mantengono autenticazione, validazione e invocazione dei servizi.

## Contratti preservati

- Restano invariati campi della response, valori `configuration_complete`,
  conteggio/capacità certificati e stato delle transazioni.
- I secret e il PEM non vengono esposti; fingerprint e validità seguono lo
  stesso calcolo precedente.
- Non sono cambiate route, response, autorizzazioni, schema SQLite o contratti
  firmware.
- Flask legacy è stato lasciato fuori dall’intervento.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- controllo righe lunghe del nuovo modulo — PASS
- `git diff --check` — PASS

## Rischi residui

Il read model riceve esplicitamente il provider e le operazioni di stato; non
possiede accesso autonomo al database o alla gestione dei secret.

## Commit

- `refactor(fastify-federation): extract provider safe view`

## Prossima tranche

Continuare l’analisi dei route adapter federation e dei servizi Fastify,
preservando i guard di sicurezza e i contratti di risposta.
