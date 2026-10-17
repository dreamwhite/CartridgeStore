# Tranche 206 — Flask filesystem store contracts

## Moduli separati

- `cartridge_store/store_contracts.py` contiene ABI dell'indice, pattern per
  identificatori/versioni e `StoreError`.
- `cartridge_store/store.py` mantiene filesystem store, indice, pubblicazione,
  metadata, varianti e query catalogo.

## Motivazione SRP

Il modulo store definiva insieme i contratti di sicurezza dei nomi e la
gestione filesystem dell'indice. I confini puri sono ora isolati; `store.py`
resta il barrel compatibile per gli import già usati dall'app e dai servizi.

## Contratti preservati

- ABI `prg32-cartridge-store-index-1.0` invariato.
- Pattern safe id/version, messaggi e tipo `StoreError` invariati.
- Nessun endpoint, percorso dati, schema, autenticazione, firmware contract o
  dato operativo è stato modificato.

## Test eseguiti

- `python3 -m py_compile cartridge_store/*.py cartridge_store/auth/*.py` — PASS
- `SECRET_KEY=legacy-test-secret-1234567890 ./.venv313/bin/pytest -q` — PASS,
  64 test
- `git diff --check` — PASS

## Rischi residui

Le operazioni di indice e filesystem restano nel servizio per mantenere
coerenti pubblicazione, varianti e rimozione dei file.

## Commit creati

- `refactor(flask-store): extract filesystem store contracts`

## Prossima tranche

Separare i contratti dello schema statistiche e mantenere le query/route in
`stats.py`, senza cambiare il tracking dei download.
