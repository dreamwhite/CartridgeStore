# Tranche 207 — Flask statistics contracts

## Moduli separati

- `cartridge_store/stats_contracts.py` contiene schema SQLite degli eventi di
  download e il pattern per i parametri data.
- `cartridge_store/stats.py` mantiene tracking, query aggregate, grafici e
  route pubbliche delle statistiche.

## Motivazione SRP

Il modulo statistiche definiva insieme il contratto persistito e le query/UI.
Schema e validazione sintattica sono ora separati; le query restano vicine
alle route per preservare filtri, ordinamenti e shape delle response.

## Contratti preservati

- Tabella `download_events` e indici invariati.
- Parametri `since`, `until` e loro validazione invariati.
- Nessun endpoint, schema, autenticazione, firmware contract o dato operativo
  è stato modificato.

## Test eseguiti

- `python3 -m py_compile cartridge_store/*.py cartridge_store/auth/*.py` — PASS
- `SECRET_KEY=legacy-test-secret-1234567890 ./.venv313/bin/pytest -q` — PASS,
  64 test
- `git diff --check` — PASS

## Rischi residui

Le query restano nello stesso modulo delle route perché condividono il
contesto Flask e la forma delle pagine/grafici legacy.

## Commit creati

- `refactor(flask-stats): extract statistics contracts`

## Prossima tranche

Analizzare `cartridge_store/metrics.py` e `cartridge_store/review.py` per
separare schema/error contract dalla ricezione dati e dal workflow review.
