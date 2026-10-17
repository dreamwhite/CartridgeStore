# Tranche 260 — Fastify configuration session cookies

## Moduli separati

- `backend/src/config/env-session.ts`
- `backend/src/config/env.ts`

## Motivazione SRP

La configurazione del cookie di sessione è una policy di sicurezza autonoma:
normalizza SameSite, determina Secure in base all'ambiente, valida il dominio
e impedisce combinazioni insicure. Il resolver è stato separato dal loader
generale mantenendo `env.ts` responsabile della composizione finale.

## Contratti preservati

- Nessun endpoint, response shape, schema SQLite o meccanismo di autenticazione
  è stato modificato.
- Sono invariati i nomi delle variabili d'ambiente, i default e i valori del
  contratto `BackendConfig`.
- Sono invariati i controlli su SameSite, Secure, produzione e dominio cookie.
- Sono invariati i messaggi di errore e l'ordine della validazione rispetto alle
  altre policy già presenti nel loader.

## Test eseguiti

Con Node.js 24.20.0:

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- `git diff --check` — PASS
- controllo righe oltre 100 caratteri sul nuovo modulo — PASS

## Rischi residui

La composizione di `BackendConfig` resta concentrata in `env.ts`; le soglie
HTTP/auth e le altre policy saranno valutate separatamente per evitare estrazioni
artificiali o cambi di precedenza nelle validazioni.

## Commit creato

- `refactor(fastify-config): extract session cookie policy`

## Prossima tranche

Valutare le soglie HTTP e auth come un eventuale dominio di configurazione
separato, soltanto se il confine può essere mantenuto senza alterare i default
o la precedenza degli errori.
