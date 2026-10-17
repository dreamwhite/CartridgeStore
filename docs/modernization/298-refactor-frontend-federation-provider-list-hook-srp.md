# Tranche 298 — Frontend federation provider list hook

## Moduli separati

- `frontend/src/components/federation/use-provider-list.ts`
- `frontend/src/components/federation/provider-list.tsx`

## Motivazione SRP

`ProviderList` gestiva sia il rendering della lista sia query, mutation e
invalidazione della cache React Query. La responsabilità di accesso e stato
server è stata estratta in `useProviderList`; il componente conserva rendering,
conferme per enable/disable e navigazione.

## Contratti preservati

- Restano invariati endpoint federation, query key, mutation enable/disable e
  messaggio di successo.
- Restano invariati conferme browser, permessi `federation:manage` e link ai
  dettagli provider.
- Non sono cambiati autenticazione, response o contratti firmware.
- Flask legacy è stato lasciato fuori dall’intervento.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir frontend run typecheck` — PASS
- `pnpm --dir frontend run lint` — PASS
- `pnpm --dir frontend run test` — PASS, 51 file e 116 test
- `pnpm --dir frontend run build` — PASS
- controllo righe lunghe del nuovo modulo — PASS
- `git diff --check` — PASS

## Rischi residui

Il hook contiene solo il confine React Query della lista; il confirmation flow
resta nel componente per mantenere l’accesso esplicito a `window.confirm`.

## Commit

- `refactor(frontend-federation): extract provider list hook`

## Prossima tranche

Continuare l’analisi dei componenti federation e workflow ancora aggregati,
senza introdurre hook o adapter quando il componente è già un coordinatore
ridotto.
