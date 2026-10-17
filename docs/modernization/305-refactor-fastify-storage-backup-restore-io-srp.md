# Tranche 305 — Fastify storage backup restore I/O

## Moduli separati

- `backend/src/storage-v2/backup-restore-io.ts`
- `backend/src/storage-v2/backup.ts`

## Motivazione SRP

`storage-v2/backup.ts` coordinava anche l’I/O atomico del journal di restore,
la copia protetta dei dati estratti e la promozione del database tra file
system diversi. Queste responsabilità sono state estratte in un adapter
dedicato; verifica, creazione, restore e gestione degli stati restano nel
workflow principale.

## Contratti preservati

- Restano invariati ABI, manifest, marker di completamento e journal di
  recovery.
- Restano invariati rifiuto di symlink e overwrite, permessi dei file,
  fault-injection points e fallback `EXDEV`.
- Restano invariati API pubbliche, autorizzazioni, schema SQLite e layout di
  storage.
- Non sono cambiate autenticazione o contratti firmware.
- Flask legacy è stato lasciato fuori dall’intervento come richiesto.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- controllo righe lunghe del nuovo modulo — PASS
- `git diff --check` — PASS

## Rischi residui

Il workflow backup principale contiene ancora validazione, inventario e
coordinamento delle fasi; sono confini sensibili e saranno estratti solo con
test mirati che dimostrino la conservazione del protocollo di recovery.

## Commit

- `refactor(fastify-storage): extract backup restore I/O`

## Prossima tranche

Continuare l’analisi Fastify su workflow e consistency, privilegiando adapter
già naturalmente isolabili e senza modificare lo stato operativo.
