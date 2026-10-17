# Flask application HTTP boundary SRP tranche

## Moduli separati

- `cartridge_store/app_http.py` contiene la policy di dimensione delle
  richieste, il parser booleano delle variabili d’ambiente e la paginazione
  del catalogo.
- `cartridge_store/app.py` mantiene la application factory, la registrazione
  delle route e i flussi accoppiati a storage, database e template.
- Il barrel compatibile in `app.py` conserva `CartridgeRequest`, le costanti e
  gli helper privati già usati internamente.

## Motivazione SRP

La policy HTTP e la paginazione sono responsabilità indipendenti dalla
composizione dell’applicazione e dai flussi di pubblicazione. L’estrazione
riduce il modulo principale senza introdurre un nuovo service layer o spostare
route con dipendenze implicite.

## Contratti preservati

- Restano invariati limiti upload, fallback delle variabili d’ambiente e
  shape della paginazione.
- Restano invariati endpoint, response, autenticazione, database e filesystem.
- Il nome pubblico `CartridgeRequest` e i riferimenti legacy `_env_bool` e
  `_catalog_pagination` restano disponibili dal modulo `app`.

## Verifica

- `python3 -m py_compile cartridge_store/*.py cartridge_store/auth/*.py` —
  PASS.
- `SECRET_KEY=legacy-test-secret-1234567890 ./.venv313/bin/pytest -q` —
  PASS, 64 test.
- `git diff --check` — PASS.

## Rischi residui

`app.py` resta un modulo ampio perché contiene route, application factory,
backup, pubblicazione e validazione ZIP con dipendenze condivise su Flask,
database e filesystem. Separare ulteriormente questi flussi richiede confini
di integrazione dedicati e test più mirati; non è stato forzato in questa
tranche per evitare cambiamenti di comportamento.

## Commit

- `refactor(flask-app): extract HTTP boundary helpers`

## Prossima tranche

Eseguire la verifica finale cross-stack e controllare che tutte le tranche
frontend, Fastify e Flask siano documentate e committate senza includere gli
artefatti locali preesistenti.
