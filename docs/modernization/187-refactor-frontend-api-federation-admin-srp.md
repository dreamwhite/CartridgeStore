# Refactor frontend federation administration API by domain

## Stato

Tranche completata con commit `refactor(frontend-api): split federation admin
API by domain`.

## Moduli separati

Il precedente `frontend/src/lib/api/federation-admin.ts` è stato ridotto a un
compatibility barrel. Le responsabilità sono ora distribuite in:

- `federation-admin/schemas.ts`: schemi Zod per provider, certificati, stati e
  identity;
- `federation-admin/types.ts`: tipi pubblici derivati dagli schemi e input dei
  provider;
- `federation-admin/transport.ts`: validazione path e mutazioni CSRF;
- `federation-admin/providers.ts`: lettura e mutazioni dei provider;
- `federation-admin/identities.ts`: link e retirement delle identity;
- `federation-admin/errors.ts`: mapping degli errori per la UI;
- `federation-admin/index.ts` e `federation-admin.ts`: facade e barrel pubblici.

## Motivazione SRP

Il modulo precedente conteneva ABI/schema, trasporto, configurazione provider,
identity e messaggi errore. I nuovi confini seguono le responsabilità già
visibili nella UI federation, mantenendo una sola facade stabile per i
consumer.

## Contratti preservati

- Nessun endpoint, metodo HTTP, header CSRF, payload o schema di risposta è
  cambiato.
- Restano invariati la validazione dei provider id, l'encoding degli id,
  l'assenza di segreti negli URL e il formato delle risposte safe status.
- `federationAdminApi` conserva gli stessi metodi e gli stessi import pubblici;
  schemi e tipi continuano a essere riesportati dal barrel storico.
- Non sono stati modificati autenticazione backend, database, firmware contract
  o dati operativi.

## Verifiche

Eseguite con Node `24.20.0`:

- `pnpm --dir frontend run typecheck` — PASS;
- `pnpm --dir frontend run lint` — PASS;
- `pnpm --dir frontend run test` — PASS, 50 file e 113 test;
- `pnpm --dir frontend run build` — PASS;
- `git diff --check` — PASS;
- controllo righe oltre 100 caratteri sui nuovi moduli — nessuna violazione.

## Rischi residui

Non sono emersi rischi funzionali nella tranche. Restano da valutare `setup.ts`
e i moduli metrics/statistics/profile/scores, poi l'estrazione dei workspace
frontend troppo grandi.

## Commit creati

- `refactor(frontend-api): split federation admin API by domain`

## Prossima tranche

Analizzare `setup.ts` e i piccoli client metrics/statistics/profile/scores per
separare solo responsabilità reali, evitando estrazioni prive di valore.
