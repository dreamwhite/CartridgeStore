# Tranche 209 — Flask review contracts

## Moduli separati

- `cartridge_store/review_contracts.py` contiene schema SQLite delle submission
  e l'insieme dei campi metadata editabili.
- `cartridge_store/review.py` mantiene creazione submission, letture, metadata
  review, approvazione/pubblicazione, rifiuto e route.

## Motivazione SRP

Il workflow review definiva insieme schema persistito e orchestrazione dei
file pending/pubblicazione. Il contratto è ora isolato; il workflow resta unico
per preservare atomiche database/filesystem e compatibilità Flask.

## Contratti preservati

- Tabella `cartridge_submissions`, indice, status e campi metadata invariati.
- Campi editabili, endpoint review, autorizzazioni editor e response invariati.
- Nessun dato operativo, schema firmware o comportamento di pubblicazione è
  stato modificato.

## Test eseguiti

- `python3 -m py_compile cartridge_store/*.py cartridge_store/auth/*.py` — PASS
- `SECRET_KEY=legacy-test-secret-1234567890 ./.venv313/bin/pytest -q` — PASS,
  64 test
- `git diff --check` — PASS

## Rischi residui

Il workflow review resta concentrato perché collega submission SQLite, file
pending, validazione cartridge e pubblicazione nell'indice.

## Commit creati

- `refactor(flask-review): extract review contracts`

## Prossima tranche

Analizzare `cartridge_store/auth/__init__.py` e separare contratti/primitivi di
identità dagli adapter Flask e dalle route, senza cambiare sessioni o CSRF.
