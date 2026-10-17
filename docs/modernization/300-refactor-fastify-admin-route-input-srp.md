# Tranche 300 — Fastify admin route input adapter

## Moduli separati

- `backend/src/admin/route-input.ts`
- `backend/src/admin/routes.ts`

## Motivazione SRP

`admin/routes.ts` conteneva sia la registrazione degli endpoint sia la
serializzazione compatibile, il parsing di body/query e la validazione degli
identificatori. Queste responsabilità sono state estratte in un adapter
condiviso; i guard di autenticazione e gli handler restano nel modulo delle
route.

## Contratti preservati

- Restano invariati serializzazione Python-compatible, status code e header
  JSON.
- Restano invariati campi sconosciuti rifiutati, limiti di paginazione, alias
  dei parametri e codici/messaggi degli errori di input.
- Non sono cambiate route, response, autenticazione, schema SQLite o contratti
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

I guard di autenticazione e la policy specifica di ogni dominio restano in
`routes.ts`; il nuovo modulo non conosce autorizzazioni né servizi applicativi.

## Commit

- `refactor(fastify-admin): extract route input adapter`

## Prossima tranche

Continuare l’analisi dei route handler admin e dei servizi Fastify, separando
solo domini indipendenti senza duplicare i guard di sicurezza.
