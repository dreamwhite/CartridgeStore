# Management CLI backup SRP tranche

## Moduli separati

- `scripts/manage/backup.mjs` contiene risoluzione dei percorsi backup,
  validazione dei file wrapper/CLI, invocazione del wrapper, listing degli
  archivi e subcommand `create/list/verify/status`.
- `scripts/manage.mjs` conserva il lifecycle generale e inietta le utility
  condivise di path, subprocess, config e output.

## Motivazione SRP

Il dominio backup ha vincoli e output propri, distinti da deploy, health,
Docker e CI. L’adapter riceve le utility esistenti tramite dipendenze esplicite
e non duplica le policy di sicurezza.

## Contratti preservati

- Restano invariati path safety, controllo permessi del key registry,
  prevenzione overlap source/destination, wrapper environment e output JSON.
- Restano invariati codici di uscita, subcommand, autorizzazione e fail-closed
  behavior.
- Nessun archivio o dato operativo è stato modificato.

## Verifica

- Node.js `24.20.0` — PASS.
- `node --check scripts/manage.mjs` — PASS.
- `node --check scripts/manage/core.mjs` — PASS.
- `node --check scripts/manage/backup.mjs` — PASS.
- `node --test scripts/manage.test.mjs` — PASS, 7 test.
- `./manage.sh --json update check` — PASS.
- `git diff --check` — PASS.

## Rischi residui

I comandi deploy, health e CI restano nel modulo principale perché coordinano
più domini e subprocess. Un’ulteriore estrazione deve mantenere il contesto
operativo esplicito senza cambiare le autorizzazioni.

## Commit

- `refactor(cli): extract backup command domain`

## Prossima tranche

Analizzare i command handler di health/deploy/CI e completare la verifica dei
workspace CLI, frontend e Fastify. Flask legacy resta escluso.
