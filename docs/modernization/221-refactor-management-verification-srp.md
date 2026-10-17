# Management CLI verification SRP tranche

## Moduli separati

- `scripts/manage/verification.mjs` contiene la matrice workspace, i runner
  pnpm/Python, il comando `test` e il comando `ci check`.
- `scripts/manage.mjs` conserva il dispatcher e inietta runtime, Compose,
  profili e output condivisi.

## Motivazione SRP

La verifica repository è un dominio distinto da deploy, health e backup. La
matrice di test rimane un’unica responsabilità perché backend, frontend, CLI,
pytest e gate Compose devono essere eseguiti nello stesso ordine contrattuale.

## Contratti preservati

- Restano invariati workspace, script richiesti, ambiente `SECRET_KEY` di test,
  profili Compose e `git diff --check`.
- Restano invariati output aggregato e stato `PASS` del comando `ci check`.
- Nessun servizio operativo è stato avviato e nessun dato è stato modificato.

## Verifica

- Node.js `24.20.0` — PASS.
- `node --check` sui moduli management — PASS.
- `node --test scripts/manage.test.mjs` — PASS, 7 test.
- `./manage.sh --json test` — PASS end-to-end:
  - Fastify: 59 file, 295 test.
  - Frontend: 51 file, 116 test.
  - CLI: 5 file, 9 test.
  - Flask/Python suite: 64 test.
  - typecheck, lint e build dei tre workspace — PASS.
- `git diff --check` — PASS.

## Rischi residui

Il comando `ci check` conserva la responsabilità trasversale di orchestrare
anche i gate Docker Compose; non è stato trasformato in astrazioni separate
per singolo servizio.

## Commit

- `refactor(cli): extract verification command domain`

## Prossima tranche

Completare l’audit dei moduli Fastify ancora grandi e dei file di deployment e
documentazione, escludendo Flask legacy dal refactoring applicativo.
