# Flask multiplayer protocol SRP tranche

## Moduli separati

- `cartridge_store/multiplayer_protocol.py` contiene `MultiplayerPeer`, la
  validazione delle signature e la normalizzazione dei messaggi peer.
- `cartridge_store/multiplayer.py` conserva il lifecycle delle stanze, il
  coordinamento concorrente del `MultiplayerHub` e l’adapter Flask/WebSocket.

## Motivazione SRP

Il protocollo wire e lo stato di una connessione hanno regole diverse dal
coordinamento delle stanze e dalla registrazione delle route. Il nuovo modulo
isola il confine firmware-facing senza spostare autenticazione, lock o
gestione delle connessioni.

## Contratti preservati

- Il pattern delle signature e la normalizzazione numerica sono invariati.
- Restano invariati i messaggi `join`, `state`, `leave`, `welcome`, `peer` e
  `error`.
- Restano invariati autenticazione, limiti delle stanze e endpoint HTTP e
  WebSocket.

## Verifica

- `python3 -m py_compile cartridge_store/*.py cartridge_store/auth/*.py` —
  PASS.
- `SECRET_KEY=legacy-test-secret-1234567890 ./.venv313/bin/pytest -q` —
  PASS, 64 test.
- `git diff --check` — PASS.

## Rischi residui

Il modulo legacy mantiene il lifecycle delle stanze e l’adapter WebSocket,
perché sono fortemente accoppiati al lock condiviso e alle route Flask. Non è
stata introdotta una nuova astrazione di trasporto.

## Commit

- `refactor(flask-multiplayer): extract multiplayer protocol`

## Prossima tranche

Analizzare `cartridge_store/app.py`, con particolare attenzione alle funzioni
pure di parsing e validazione archivio; le route e l’application factory
restano da trattare solo se esiste un confine verificabile senza alterare i
contratti.
