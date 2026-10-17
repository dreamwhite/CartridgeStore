# Frontend federation provider list SRP tranche

## Moduli separati

- `frontend/src/components/federation/provider-list.tsx` contiene query,
  mutation e presentazione dell’elenco provider con il relativo toggle.
- `frontend/src/components/federation/FederationWorkspace.tsx` conserva gli
  altri workspace federation e riesporta `ProviderList` per compatibilità.

## Motivazione SRP

L’elenco provider gestisce una singola responsabilità: osservare il registry e
aggiornare lo stato abilitato/disabilitato. Separarlo dal form, dai dettagli e
dai link identità riduce il workspace aggregatore senza introdurre nuove
astrazioni o modificare gli adapter API.

## Contratti preservati

- Route, import pubblici, query key, endpoint e payload mutation sono invariati.
- Restano invariati permessi, conferme utente, messaggi e invalidazione cache.
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

`FederationWorkspace.tsx` contiene ancora form, dettagli e identity links per
preservare il percorso di compatibilità corrente; saranno separati solo con
tranche autonome e verificabili.

## Commit

- `refactor(frontend-ui): extract federation provider list`

## Prossima tranche

Valutare la separazione del form federation o dei dettagli provider, mantenendo
barrel e import pubblici fino alla conclusione della migrazione.
