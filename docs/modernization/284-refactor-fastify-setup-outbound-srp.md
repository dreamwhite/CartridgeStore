# Tranche 284 — Fastify setup outbound boundary

## Moduli separati

- `backend/src/setup/outbound/types.ts`
- `backend/src/setup/outbound/target.ts`
- `backend/src/setup/outbound/fetch.ts`
- `backend/src/setup/outbound.ts`

## Motivazione SRP

`setup/outbound.ts` combinava la policy di sicurezza per indirizzi e target
DNS con il trasporto HTTP bounded e la gestione dei redirect. La validazione
del target è ora in `target.ts`, il fetch bounded in `fetch.ts` e i contratti
condivisi in `types.ts`. Il file originale resta un barrel di compatibilità.

## Contratti preservati

- Restano disponibili da `setup/outbound.ts` `OutboundValidationError`,
  `ValidatedOutboundTarget`, `isForbiddenAddress`, `resolveOutboundHost`,
  `validateOutboundUrl` e `fetchBoundedText`.
- Sono invariati policy di allowlist, blocco degli indirizzi privati,
  protocolli, redirect, timeout, limiti di risposta e codici errore.
- Non sono cambiati endpoint, response, autenticazione, database o contratti
  firmware.
- Flask legacy è stato lasciato intatto.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- controllo righe lunghe dei nuovi moduli — PASS
- `git diff --check` — PASS

## Rischi residui

La compatibilità dipende dal barrel `setup/outbound.ts`; i consumer interni
continuano a usare lo stesso percorso. Le policy di rete rimangono isolate
ma non sono state modificate semanticamente.

## Commit

- `refactor(fastify-setup): split outbound validation`

## Prossima tranche

Analizzare `setup/service.ts` per un'eventuale separazione dei mutatori degli
step, solo se il confine può essere mantenuto senza alterare lo stato persistito
o il protocollo della procedura di installazione.
