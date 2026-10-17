# Flask authentication contracts SRP tranche

## Moduli separati

- `cartridge_store/auth/contracts.py` ora contiene la mappa dei livelli di
  ruolo, lo schema SQLite di autenticazione e i contratti `Principal` e
  `ANONYMOUS`.
- `cartridge_store/auth/__init__.py` conserva il barrel pubblico e la logica
  di sessione, token, CSRF, autorizzazione e registrazione delle route.

## Motivazione SRP

I dati identitari e lo schema persistente sono contratti stabili, distinti
dalla gestione delle richieste Flask e dalle operazioni sul database.
L'estrazione riduce il contesto del modulo principale senza introdurre una
nuova astrazione nel flusso di autenticazione.

## Contratti preservati

- Nessun endpoint, campo di risposta, livello di ruolo o regola di
  autorizzazione è cambiato.
- `AUTH_SCHEMA` resta idempotente e invariato.
- Il barrel `cartridge_store.auth` continua a esportare i simboli pubblici
  usati da `app.py`, `multiplayer.py` e `auth/local.py`.

## Verifica

- `python3 -m py_compile cartridge_store/*.py cartridge_store/auth/*.py` —
  PASS.
- `SECRET_KEY=legacy-test-secret-1234567890 ./.venv313/bin/pytest -q` —
  PASS, 64 test.
- `git diff --check` — PASS.

## Rischi residui

La gestione di sessione, token, CSRF, database e route resta accentrata nel
modulo legacy per evitare cambiamenti di sicurezza o comportamento. Una
ulteriore separazione richiede test di integrazione mirati prima di spostare
logica eseguibile.

## Commit

- `refactor(flask-auth): extract authentication contracts`

## Prossima tranche

Analizzare il relay WebSocket multiplayer e separare solo i contratti privi di
stato condiviso, quindi verificare nuovamente l'intera suite Flask.
