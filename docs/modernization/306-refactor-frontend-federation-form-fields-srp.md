# Tranche 306 — Frontend federation form fields

## Moduli separati

- `frontend/src/components/federation/oidc-provider-fields.tsx`
- `frontend/src/components/federation/saml-provider-fields.tsx`
- `frontend/src/components/federation/provider-form-fields.tsx`

## Motivazione SRP

`provider-form-fields.tsx` conteneva due form protocollari indipendenti. I
campi OIDC e SAML sono stati separati in componenti dedicati; il file
originario resta un barrel di compatibilità per gli import del form e per gli
export pubblici già usati dal frontend.

## Contratti preservati

- Restano invariati props, valori controllati, callback e rendering dei campi.
- Restano invariati i mapping OIDC/SAML, i valori di default e la gestione dei
  secret/certificati.
- Non sono cambiate route, API, autenticazione o contratti firmware.
- Flask legacy è stato lasciato fuori dall’intervento come richiesto.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir frontend run typecheck` — PASS
- `pnpm --dir frontend run lint` — PASS
- `pnpm --dir frontend run test` — PASS, 51 file e 116 test
- `pnpm --dir frontend run build` — PASS
- controllo righe lunghe dei nuovi moduli — PASS
- `git diff --check` — PASS

## Rischi residui

`provider-form.tsx` coordina ancora lo stato comune e l’invio del form; i
campi protocollari ora sono isolati senza duplicare la logica di submission.

## Commit

- `refactor(frontend-federation): split protocol form fields`

## Prossima tranche

Continuare l’analisi dei componenti federati e dei workspace solo dove esiste
un confine di hook, adapter o presentazione verificabile.
