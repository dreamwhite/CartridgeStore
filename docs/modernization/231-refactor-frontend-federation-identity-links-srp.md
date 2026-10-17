# Frontend federation identity links SRP tranche

## Moduli separati

- `frontend/src/components/federation/identity-links.tsx` contiene la pagina
  di mapping esplicito, elenco link e form di creazione/revoca.
- `frontend/src/components/federation/FederationWorkspace.tsx` conserva
  overview e creazione provider.
- `FederationWorkspace.tsx` riesporta `IdentityLinks` per compatibilità degli
  import esistenti.

## Motivazione SRP

Identity links hanno un dominio UI autonomo: permesso federation, elenco link,
selezione provider e form di mapping. Separarli dal workspace provider riduce
accoppiamento senza duplicare o alterare l’hook di dominio.

## Contratti preservati

- Endpoint, payload, query key, permessi, conferme e messaggi sono invariati.
- Restano invariati i vincoli: nessun matching per email e nessuna creazione
  automatica di utenti.
- Nessuna autenticazione, autorizzazione backend o configurazione è cambiata.

## Verifica

- Node.js `24.20.0` — PASS.
- `pnpm --dir frontend run typecheck` — PASS.
- `pnpm --dir frontend run lint` — PASS.
- `pnpm --dir frontend run test` — PASS, 51 file e 116 test.
- `pnpm --dir frontend run build` — PASS.
- `git diff --check` — PASS.
- Il nuovo modulo non contiene righe oltre 100 caratteri.

## Rischi residui

`FederationWorkspace.tsx` ora è un barrel operativo per overview e new
provider; ulteriori estrazioni possono ridurlo ancora, ma il dominio
federation UI è già separato per lista, form, dettagli e identity links.

## Commit

- `refactor(frontend-ui): extract federation identity links`

## Prossima tranche

Riprendere l’audit dei residui frontend/CLI/Fastify, privilegiando moduli con
responsabilità ancora chiaramente indipendenti.
