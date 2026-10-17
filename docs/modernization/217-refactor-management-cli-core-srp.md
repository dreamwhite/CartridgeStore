# Management CLI core SRP tranche

## Moduli separati

- `scripts/manage/core.mjs` contiene codici di uscita, profili compose,
  service aliases, redazione delle chiavi segrete, `ManagementError` e parser
  degli argomenti.
- `scripts/manage.mjs` conserva il lifecycle Docker, health/readiness, backup,
  deploy, test e CI.
- Gli export pubblici da `scripts/manage.mjs` restano compatibili per i test e
  gli operatori esistenti.

## Motivazione SRP

Il boundary CLI e i contratti di errore/opzioni sono responsabilità diverse
dall’esecuzione delle operazioni infrastrutturali. L’estrazione rende il
parsing riutilizzabile e testabile senza spostare effetti collaterali o
mutazioni operative.

## Contratti preservati

- Profili, codici di uscita, help, parser e output JSON sono invariati.
- Restano invariati fail-closed, gestione segreti, validazione opzioni e
  comportamento Docker.
- Nessun dato operativo, servizio o file di deployment è stato modificato.

## Verifica

- Node.js `24.20.0` — PASS.
- `node --check scripts/manage.mjs` — PASS.
- `node --check scripts/manage/core.mjs` — PASS.
- `node --test scripts/manage.test.mjs` — PASS, 7 test.
- `./manage.sh --help` e `./manage.sh --json update check` — PASS.
- `git diff --check` — PASS.

## Rischi residui

`manage.mjs` contiene ancora i command handler infrastrutturali; separarli
richiederebbe introdurre un contesto di dipendenze per Docker, filesystem e
output. La prossima estrazione dovrebbe trattare un dominio completo, ad
esempio backup, con test di integrazione dedicati.

## Commit

- `refactor(cli): extract management command core`

## Prossima tranche

Analizzare il resto del CLI amministrativo e i command handler di `manage.mjs`,
poi verificare il workspace completo senza coinvolgere Flask legacy.
