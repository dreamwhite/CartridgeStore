# Tranche 205 — Flask PRG32 format contracts

## Moduli separati

- `cartridge_store/format_contracts.py` contiene costanti ABI, profili di
  architettura, eccezioni e dataclass del formato cartridge.
- `cartridge_store/prg32_format.py` mantiene parsing, validazione,
  normalizzazione e costruzione dei binari, restando il barrel pubblico
  compatibile.

## Motivazione SRP

Il parser definiva nello stesso modulo il contratto dei blocchi e la logica di
codec binario. I value object e le costanti ora sono indipendenti dalla logica
di trasformazione; gli import esistenti continuano a passare dal modulo
`prg32_format`.

## Contratti preservati

- ABI `prg32-metadata-1.0` e `prg32-colophon-1.0` invariati.
- Magic, header, TLV, blocchi, profili `esp32c6`/`qemu`, eccezioni e dataclass
  invariati.
- Nessun endpoint, schema, autenticazione, firmware contract o dato operativo
  è stato modificato.

## Test eseguiti

- `python3 -m py_compile cartridge_store/*.py cartridge_store/auth/*.py` — PASS
- `SECRET_KEY=legacy-test-secret-1234567890 ./.venv313/bin/pytest -q` — PASS,
  64 test
- `git diff --check` — PASS

La suite con il `.venv` Python 3.9 non è compatibile con `hashlib.scrypt`; la
verifica valida è stata eseguita con `.venv313` e una secret di test esplicita.

## Rischi residui

Il codec binario resta concentrato perché parsing, validazione e ricostruzione
condividono invarianti sul legacy payload e sul trailer. Le estrazioni ulteriori
richiedono test differenziali sul formato.

## Commit creati

- `refactor(flask-format): extract cartridge format contracts`

## Prossima tranche

Analizzare `cartridge_store/store.py` e `cartridge_store/stats.py` per separare
contratti e helper puri dalle operazioni filesystem/database.
