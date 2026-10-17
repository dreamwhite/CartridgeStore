# Frontend federation presentation SRP tranche

## Moduli separati

- `frontend/src/components/federation/presentation-primitives.tsx` contiene
  `Panel`, `Notice`, `Field`, `TextArea`, `StatusBadge` ed `Endpoint`.
- `frontend/src/components/federation/certificate-panel.tsx` contiene la
  gestione visuale del trust set SAML.
- `frontend/src/components/federation/presentation.tsx` resta un barrel di
  compatibilità per gli import esistenti.

## Motivazione SRP

Le primitive di layout e form erano mescolate alla gestione del trust set
certificati. I due moduli ora hanno responsabilità indipendenti, senza
introdurre nuovi hook o cambiare lo stato gestito da `FederationWorkspace`.

## Contratti preservati

- Nessuna route, chiamata API, mutation o shape dati è cambiata.
- Gli import pubblici dal modulo `./presentation` restano compatibili.
- Le conferme, il reset dei certificati e la protezione dei valori PEM restano
  invariati.

## Verifica

- Node.js `24.20.0` — PASS.
- `pnpm --dir frontend run typecheck` — PASS.
- `pnpm --dir frontend run lint` — PASS.
- `pnpm --dir frontend run test` — PASS, 50 file e 113 test.
- `pnpm --dir frontend run build` — PASS.
- Controllo righe oltre 100 caratteri sui file nuovi — PASS.
- `git diff --check` — PASS.

## Rischi residui

Le API frontend `metrics`, `profile`, `scores` e `statistics` sono già piccole
e con responsabilità coerenti; frammentarle ulteriormente aumenterebbe il
numero di moduli senza un confine SRP reale.

## Commit

- `refactor(frontend-ui): split federation presentation modules`

## Prossima tranche

Analizzare gli store Zustand e i componenti workflow residui; procedere solo
dove esista aggregazione di responsabilità verificabile.
