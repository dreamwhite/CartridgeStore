# Management CLI health SRP tranche

## Moduli separati

- `scripts/manage/health.mjs` contiene probe HTTP JSON, snapshot health e
  retry bounded del comando `health`.
- `scripts/manage.mjs` conserva compose orchestration e inietta le utility
  per subprocess, service discovery e output.

## Motivazione SRP

Health/readiness è un dominio read-only distinto da backup, deploy e gestione
del lifecycle. Il modulo separato mantiene la policy di probe senza duplicare
la costruzione dei comandi Docker.

## Contratti preservati

- Restano invariati endpoint `/health` e `/ready`, porta candidate `5090`,
  porta standard `5080`, scheduler check e codici `UNHEALTHY`.
- Restano invariati timeout, retry massimo di 60 secondi e gestione degli
  errori subprocess.
- Nessun container, servizio o dato operativo è stato modificato.

## Verifica

- Node.js `24.20.0` — PASS.
- `node --check scripts/manage.mjs` — PASS.
- `node --check scripts/manage/health.mjs` — PASS.
- `node --test scripts/manage.test.mjs` — PASS, 7 test.
- `./manage.sh --json update check` — PASS.
- `git diff --check` — PASS.

## Rischi residui

Deploy e CI coordinano rispettivamente mutazioni Docker e l’intera matrice di
verifica. Richiedono un contesto operativo comune più ampio del solo health e
non sono stati spostati in questa tranche.

## Commit

- `refactor(cli): extract health command domain`

## Prossima tranche

Analizzare deploy e CI come domini distinti, mantenendo invariati i gate
fail-closed e la sequenza delle verifiche.
