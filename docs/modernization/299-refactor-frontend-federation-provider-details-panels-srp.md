# Tranche 299 — Frontend federation provider details panels

## Moduli separati

- `frontend/src/components/federation/provider-details-content.tsx`
- `frontend/src/components/federation/provider-details.tsx`

## Motivazione SRP

`ProviderDetails` coordinava caricamento, editing e tre aree presentazionali
distinte: configurazione sicura, rotazione del secret OIDC e revoca delle
transazioni. I pannelli sono stati estratti con props esplicite; il componente
mantiene query, mutation, permessi e orchestrazione delle azioni sensibili.

## Contratti preservati

- Restano invariati valori visualizzati, messaggi, conferme e callback delle
  mutation federation.
- Restano invariati permessi `federation:manage`, re-autenticazione e gestione
  dei certificati SAML.
- Non sono cambiati endpoint, payload, autenticazione o contratti firmware.
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

I pannelli ricevono callback e mutation con interfacce strutturali minime; non
possiedono query o cache e quindi non introducono un secondo stato server.

## Commit

- `refactor(frontend-federation): split provider details panels`

## Prossima tranche

Continuare l’analisi frontend, privilegiando hook e componenti di dominio con
responsabilità indipendenti e lasciando invariati i barrel pubblici.
