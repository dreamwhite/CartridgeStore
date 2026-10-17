# Management CLI deploy SRP tranche

## Moduli separati

- `scripts/manage/deploy.mjs` contiene il comando deploy, il piano dry-run,
  l’autorizzazione esplicita, il lock operativo e il controllo health post-start.
- `scripts/manage.mjs` conserva il dispatcher e inietta le utility condivise.

## Motivazione SRP

Deploy è un dominio mutativo distinto da health, backup e parsing CLI. Il
modulo separato mantiene il workflow completo e rende esplicite le sue
dipendenze infrastrutturali.

## Contratti preservati

- Restano invariati modalità `--dry-run`/`--apply`, autorizzazione,
  blocco del profilo operational e codici di uscita.
- Restano invariati lock, compose `up -d`, health post-deploy e piano JSON.
- Nessun deployment o dato operativo è stato modificato.

## Verifica

- Node.js `24.20.0` — PASS.
- `node --check scripts/manage.mjs` — PASS.
- `node --check scripts/manage/deploy.mjs` — PASS.
- `node --test scripts/manage.test.mjs` — PASS, 7 test.
- `./manage.sh --json deploy --dry-run` — PASS, risultato fail-closed per
  configurazione mancante.
- `git diff --check` — PASS.

## Rischi residui

Il comando CI resta trasversale perché coordina tutti i workspace, Docker
Compose e la verifica diff. Verrà separato solo mantenendo quella sequenza
come contratto unico.

## Commit

- `refactor(cli): extract deploy command domain`

## Prossima tranche

Separare il runner CI/test come dominio di verifica repository e poi eseguire
la pipeline completa dei workspace.
