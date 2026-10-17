# Tranche 208 — Flask metrics contracts

## Moduli separati

- `cartridge_store/metrics_contracts.py` contiene lo schema SQLite di runs,
  samples e relativi indici.
- `cartridge_store/metrics.py` mantiene parsing payload, validazione, ingest,
  export e route MetricsServer-compatible.

## Motivazione SRP

Il receiver metrics definiva insieme schema persistito e comportamento HTTP.
Lo schema è ora isolato; ingest ed export restano vicini per preservare
envelopes, limiti e autorizzazioni.

## Contratti preservati

- Tabelle `runs`/`samples`, colonne, indici e migrazioni additive invariati.
- Endpoint `/api/runs`, `/api/metrics/batch`, export CSV/Markdown e relativi
  error envelope invariati.
- Nessun dato operativo o contratto firmware è stato modificato.

## Test eseguiti

- `python3 -m py_compile cartridge_store/*.py cartridge_store/auth/*.py` — PASS
- `SECRET_KEY=legacy-test-secret-1234567890 ./.venv313/bin/pytest -q` — PASS,
  64 test
- `git diff --check` — PASS

## Rischi residui

La ricezione e l'export restano nello stesso modulo per mantenere coerenza tra
schema, policy di ownership e shape delle response.

## Commit creati

- `refactor(flask-metrics): extract metrics contracts`

## Prossima tranche

Chiudere la tranche review separando il contratto di submission e metadata,
quindi analizzare auth e multiplayer legacy.
