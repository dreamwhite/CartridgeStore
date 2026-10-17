# Tranche 296 — Fastify admin mutation runner

## Moduli separati

- `backend/src/admin/mutation-runner.ts`
- `backend/src/admin/service.ts`

## Motivazione SRP

`AdminIdentityService` conteneva sia le policy di utenti e gruppi sia il
confine tecnico comune di transazione SQLite, audit e mapping degli errori di
vincolo. Il runner estratto coordina esclusivamente la mutazione amministrativa
audited; le regole di sicurezza, protezione dell’ultimo amministratore e
gestione delle identità restano nel servizio.

## Contratti preservati

- Restano invariati audit `attempted`, `committed` e `failed`, rollback e
  comportamento fail-closed dell’audit.
- Restano invariati mapping `identity_conflict`, `user_delete_restricted` e
  `admin_operation_failed`.
- Non sono cambiati autorizzazioni, protezioni self/final-admin, endpoint,
  response, schema SQLite o contratti firmware.
- Flask legacy è stato lasciato fuori dall’intervento.

## Verifica

Ambiente: Node.js `24.20.0`.

- `pnpm --dir backend run typecheck` — PASS
- `pnpm --dir backend run lint` — PASS
- `pnpm --dir backend run test` — PASS, 59 file e 295 test
- `pnpm --dir backend run build` — PASS
- controllo righe lunghe del nuovo modulo — PASS
- `git diff --check` — PASS

## Rischi residui

Il runner dipende intenzionalmente dall’implementazione esistente di
`AdminAuditLog` e dall’errore di dominio `AdminError`; non introduce un nuovo
meccanismo di persistenza o una seconda transazione.

## Commit

- `refactor(fastify-admin): extract mutation runner`

## Prossima tranche

Continuare la separazione dei servizi Fastify solo dove esistono confini
indipendenti, mantenendo le policy amministrative nello stesso dominio.
