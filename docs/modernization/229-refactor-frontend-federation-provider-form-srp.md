# Frontend federation provider form SRP tranche

## Moduli separati

- `frontend/src/components/federation/provider-form.tsx` contiene il form
  OIDC/SAML e la sola presentazione dei campi e delle azioni.
- `frontend/src/components/federation/FederationWorkspace.tsx` conserva la
  composizione overview, creazione, dettagli e identity links.
- `FederationWorkspace.tsx` importa e riesporta `ProviderForm` per mantenere
  la compatibilità degli import esistenti.

## Motivazione SRP

Il form aveva una responsabilità distinta rispetto ai workspace che gestiscono
query, dettagli provider e link identità. Il nuovo modulo usa lo stesso hook e
gli stessi adapter, limitandosi a presentare e inoltrare gli eventi del form.

## Contratti preservati

- Payload, validazione, reset dei secret, permessi e messaggi sono invariati.
- Route, import pubblici e API federation non sono cambiati.
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

I workspace overview, dettagli e identity links restano nel file aggregatore
perché hanno ancora dipendenze condivise; saranno separati solo con confini
autonomi e verificabili.

## Commit

- `refactor(frontend-ui): extract federation provider form`

## Prossima tranche

Valutare la separazione del workspace provider details oppure riprendere
l’audit dei residui Fastify, mantenendo i barrel di compatibilità.
