# Frontend statistics presentation SRP tranche

## Moduli separati

- `frontend/src/components/storefront/statistics-presentation.tsx` contiene
  formattazione numerica, card statistiche, trend download e stato errore.
- `frontend/src/components/storefront/StatisticsPage.tsx` conserva query,
  composizione delle sezioni e collegamenti di navigazione.

## Motivazione SRP

La pagina orchestrava query remote e markup ripetibile nello stesso modulo.
Separare i componenti di presentazione mantiene il workspace focalizzato sul
caricamento e sulla composizione dei dati, senza introdurre nuovi adapter API.

## Contratti preservati

- Nessun endpoint, query key, parametro, response shape o routing è cambiato.
- Sono invariati testi, formattazione numerica, calcolo del trend e stati di
  caricamento/errore.
- Nessuna autenticazione, autorizzazione o dato operativo è stato modificato.

## Verifica

- Node.js `24.20.0` — PASS.
- `pnpm --dir frontend run typecheck` — PASS.
- `pnpm --dir frontend run lint` — PASS.
- `pnpm --dir frontend run test` — PASS, 51 file e 116 test.
- `pnpm --dir frontend run build` — PASS.
- `git diff --check` — PASS.
- Il nuovo modulo non contiene righe oltre 100 caratteri.

## Rischi residui

`StatisticsPage` conserva volutamente la composizione delle tre query perché
la loro gestione condivisa determina lo stato aggregato della pagina.

## Commit

- `refactor(frontend-ui): extract statistics presentation`

## Prossima tranche

Continuare l’audit frontend dei workspace e dei componenti workflow, oppure
riprendere i residui Fastify solo quando emerga un confine SRP autonomo.
