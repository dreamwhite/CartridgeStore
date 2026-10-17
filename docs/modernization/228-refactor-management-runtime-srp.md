# Management CLI runtime SRP tranche

## Moduli separati

- `scripts/manage/runtime.mjs` contiene process execution, Docker/Compose
  probing, costruzione degli argomenti Compose e normalizzazione dei servizi.
- `scripts/manage.mjs` conserva parsing del contesto, policy di configurazione,
  orchestrazione dei comandi e mantiene le riesportazioni compatibili.

## Motivazione SRP

Il runtime di processo e Compose è condiviso da backup, health, deploy e
verification, ma non appartiene a uno specifico comando. Isolarlo riduce il
dispatcher senza duplicare timeout, redazione dei secret o gestione degli
errori subprocess.

## Contratti preservati

- Comandi, exit code, profili, output JSON/human e argomenti Compose sono
  invariati.
- Restano invariati timeout, redazione secret, errori Docker/Compose e
  normalizzazione dei servizi.
- Nessun container, file operativo, database o servizio è stato modificato.

## Verifica

- Node.js `24.20.0` — PASS.
- `node --check scripts/manage.mjs` e `scripts/manage/runtime.mjs` — PASS.
- `node --test scripts/manage.test.mjs` — PASS, 7 test.
- `pnpm --dir cli run typecheck` — PASS.
- `pnpm --dir cli run lint` — PASS.
- `pnpm --dir cli run test` — PASS, 5 file e 9 test.
- `pnpm --dir cli run build` — PASS.
- `git diff --check` — PASS.
- Il nuovo modulo non contiene righe oltre 100 caratteri.

## Rischi residui

Il dispatcher conserva ancora gestione config e lifecycle perché condividono
stato e policy tra più comandi; ulteriori estrazioni dovranno mantenere gli
stessi dependency boundary.

## Commit

- `refactor(cli): extract management runtime`

## Prossima tranche

Continuare l’audit CLI e dei workspace frontend residui con estrazioni per
dominio, senza alterare il contratto dei comandi.
