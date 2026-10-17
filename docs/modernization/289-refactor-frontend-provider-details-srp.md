# Tranche 289 — Frontend provider details presentation

## Moduli separati

- `frontend/src/components/federation/provider-details-panels.tsx`
- `frontend/src/components/federation/provider-details.tsx`

## Motivazione SRP

`ProviderDetails` coordinava query, mutation sensibili, form editing e più
sezioni di presentazione. Sono stati estratti l’header con identità e azioni
del provider e il pannello degli endpoint canonici. Hook, adapter di mutation,
form state e contratti API restano invariati.

## Contratti preservati

- Restano invariati routing, permessi, conferma di disabilitazione e callback
  OIDC/SAML visualizzati.
- Non sono cambiati API client, response, autenticazione o contratti firmware.
- Il comportamento del form e delle mutation resta nel componente e negli hook
  esistenti.
- Flask legacy è stato lasciato intatto.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir frontend run typecheck` — PASS
- `pnpm --dir frontend run lint` — PASS
- `pnpm --dir frontend run test` — PASS, 51 file e 116 test
- `pnpm --dir frontend run build` — PASS
- controllo righe lunghe del nuovo modulo — PASS
- `git diff --check` — PASS

## Rischi residui

`ProviderDetails` contiene ancora il coordinamento di query e mutation perché
questo boundary è necessario per mantenere una singola policy di azioni
sensibili. Ulteriori estrazioni dovranno evitare di duplicare tale policy.

## Commit

- `refactor(frontend-federation): split provider details panels`

## Prossima tranche

Continuare l’analisi dei workspace frontend e dei componenti federation più
grandi, estraendo solo hook o presentazione con responsabilità indipendenti.
