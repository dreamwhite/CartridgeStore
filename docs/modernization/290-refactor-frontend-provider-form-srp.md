# Tranche 290 — Frontend provider form fields

## Moduli separati

- `frontend/src/components/federation/provider-form-fields.tsx`
- `frontend/src/components/federation/provider-form.tsx`

## Motivazione SRP

`ProviderForm` conteneva nello stesso componente i campi comuni e tutti i
campi protocol-specifici OIDC e SAML. I due gruppi di campi sono stati estratti
come componenti controllati; `useProviderForm` resta l’unica fonte dello stato,
della validazione e della costruzione del payload.

## Contratti preservati

- Sono invariati submit, reset, cancel, valori iniziali e callback dello stato
  form.
- Non sono cambiati payload API, client authentication method, callback URI,
  certificati, trust set o contratti firmware.
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

Il form principale coordina ancora reset, errori e submit perché questi aspetti
devono condividere lo stesso hook e la stessa policy di dati sensibili.

## Commit

- `refactor(frontend-federation): split provider form fields`

## Prossima tranche

Continuare l’analisi dei workspace frontend residui, con attenzione a hook e
presentazione indipendenti senza introdurre nuove astrazioni di dominio.
