# Tranche 297 — Frontend federation identity links SRP

## Moduli separati

- `frontend/src/components/federation/identity-link-types.ts`
- `frontend/src/components/federation/identity-links-table.tsx`
- `frontend/src/components/federation/identity-links-form.tsx`
- `frontend/src/components/federation/identity-links.tsx`
- `frontend/src/components/federation/use-identity-links.ts`

## Motivazione SRP

`IdentityLinks` gestiva insieme stato/query, tabella delle identità collegate
e form di creazione. Lo stato del form, la tabella read-only e il form
presentazionale sono stati separati; il componente principale conserva
permessi, conferme sensibili e coordinamento delle mutation.

## Contratti preservati

- Restano invariati endpoint, payload, query key e callback dell’API federation.
- Restano invariati permessi `federation:manage`, conferme di retirement,
  messaggi, campi del form e conversione numerica di `user_id`.
- Non sono cambiati autenticazione, response o contratti firmware.
- Flask legacy è stato lasciato fuori dall’intervento.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir frontend run typecheck` — PASS
- `pnpm --dir frontend run lint` — PASS
- `pnpm --dir frontend run test` — PASS, 51 file e 116 test
- `pnpm --dir frontend run build` — PASS
- controllo righe lunghe dei nuovi moduli — PASS
- `git diff --check` — PASS

## Rischi residui

Non sono stati introdotti nuovi hook o adapter: il hook esistente continua a
possedere query, mutation e cache invalidation, mentre i nuovi componenti
ricevono solo dati e callback espliciti.

## Commit

- `refactor(frontend-federation): split identity links presentation`

## Prossima tranche

Continuare l’analisi dei componenti federation e workflow ancora aggregati,
senza frammentare workspace già ridotti a coordinatori di presentazione.
