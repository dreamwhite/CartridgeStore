# Tranche 302 — Fastify federation provider input

## Moduli separati

- `backend/src/federation/provider-route-input.ts`
- `backend/src/federation/admin-routes.ts`

## Motivazione SRP

`federation/admin-routes.ts` gestiva anche validazione degli identificatori,
limiti dei campi testuali, protocollo e conversione dei nomi JSON verso il
contratto interno `ProviderInput`. Queste responsabilità sono state estratte
in un adapter di input; autenticazione, autorizzazione e handler restano nelle
route.

## Contratti preservati

- Restano invariati regex e limiti degli identificatori, errori e messaggi di
  validazione.
- Restano invariati mapping dei campi OIDC/SAML, requisito degli entity ID SAML
  e shape passata a `FederationProviderService`.
- Non sono cambiate route, response, secret handling, schema SQLite o
  contratti firmware.
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

L’adapter non conosce sessioni, permessi o servizi; riceve solo il payload
grezzo e continua a restituire il tipo applicativo già usato dalle route.

## Commit

- `refactor(fastify-federation): extract provider route input`

## Prossima tranche

Continuare l’analisi dei moduli Fastify ancora grandi, privilegiando confini
di dominio verificabili senza introdurre nuove astrazioni generiche.
