# Tranche 286 — Fastify federation SAML validation

## Moduli separati

- `backend/src/federation/provider-saml-validation.ts`
- `backend/src/federation/provider-validation.ts`

## Motivazione SRP

`provider-validation.ts` combinava la normalizzazione comune dei provider con
la validazione crittografica e semantica specifica SAML. I certificati, il
trust set bounded, il NameID format e il clock skew sono stati estratti nel
modulo SAML dedicato; la normalizzazione OIDC/SAML comune resta nel modulo
originale.

## Contratti preservati

- `normalizeProvider` mantiene la stessa firma e gli stessi risultati.
- Sono invariati codici errore, limiti, certificati legacy, fingerprint,
  policy NameID e clock skew.
- Non sono cambiati endpoint, response, autenticazione, database o contratti
  firmware.
- Flask legacy è stato lasciato intatto.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- controllo righe lunghe del nuovo modulo — PASS
- `git diff --check` — PASS

## Rischi residui

La normalizzazione principale resta un punto di coordinamento volutamente
condiviso tra OIDC e SAML. Il nuovo modulo dipende dal validatore testuale
comune per conservare esattamente le regole precedenti.

## Commit

- `refactor(fastify-federation): extract SAML validation`

## Prossima tranche

Continuare l’analisi dei moduli Fastify residui solo dove emerga un confine
stabile, dando priorità ai servizi applicativi non ancora separati.
