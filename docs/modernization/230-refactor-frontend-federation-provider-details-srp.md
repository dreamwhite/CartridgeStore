# Frontend federation provider details SRP tranche

## Moduli separati

- `frontend/src/components/federation/provider-details.tsx` contiene query,
  mutation e presentazione del dettaglio provider.
- `frontend/src/components/federation/FederationWorkspace.tsx` conserva
  overview, creazione e identity links.
- `FederationWorkspace.tsx` importa e riesporta `ProviderDetails` per
  mantenere gli import pubblici esistenti.

## Motivazione SRP

Il dettaglio provider coordina una responsabilità distinta: configurazione
safe, endpoint canonici, certificati, rotazione secret e revoca transazioni.
Separarlo riduce il workspace aggregatore mantenendo lo stesso hook e gli
stessi adapter di dominio.

## Contratti preservati

- Route, import pubblici, endpoint, payload mutation e permessi sono invariati.
- Restano invariati conferme, errori, invalidazione e gestione dei secret.
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

Overview, NewProvider e IdentityLinks restano nel file aggregatore; la loro
separazione richiede ulteriori tranche per evitare di accoppiare query e form
con responsabilità diverse.

## Commit

- `refactor(frontend-ui): extract federation provider details`

## Prossima tranche

Valutare l’estrazione di `IdentityLinks` oppure riprendere i residui Fastify,
senza modificare contratti API o autenticazione.
