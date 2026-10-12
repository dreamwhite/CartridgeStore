# Open questions and approval decisions

These questions are intentionally left unresolved because the repository cannot answer them. A maintainer should decide them before the corresponding milestone begins.

## Deployment and scale

1. Does the public deployment differ from this checkout, and can a sanitized production route/headers/config snapshot be provided?
2. Is the supported topology one Gunicorn process with threads, or will multiple workers/replicas be required?
3. What catalog size, download volume, simultaneous WebSocket peer count, metrics sample rate, and retention period are expected?
4. Is port 5080 reachable directly, or always behind HTTPS/reverse proxy?

## Product scope

5. Are “featured”, categories, ratings, changelogs, drafts, ownership, source browsing, and active-developer counts desired features or only design ideas?
6. Should the user profile remain a metrics/run profile, or become a developer/cartridge profile?
7. Should editor review remain a global group capability, or become owner/project scoped?
8. Should the React application replace all browser pages, or only the catalog/developer experience while admin remains server-rendered?

## Security and compatibility

9. Can the fixed bootstrap credential be replaced with one-time setup now, or is there a classroom compatibility requirement?
10. Must metrics creation/batch/finish remain anonymous for existing firmware? If so, what rate/size limits are acceptable?
11. Are anonymous run details/reports intended to be public? The current implementation does not apply the same owner check to all exports.
12. Are OIDC, SAML, and LDAP required in the first React release, and which provider(s) can be used in a staging test?
13. Should backups encrypt/redact provider and SMTP settings, and who owns key management?

## Backend/database

14. Is a TypeScript backend a strategic requirement, or is TypeScript wanted only for the frontend?
15. If a TypeScript backend is approved, should it preserve SQLite and all table/column names exactly?
16. Who owns database migration approval, restore drills, and production rollback?
17. Is the JSON catalog index an intentional public artifact/index ABI, or may it become a derived SQLite projection later?

## Decision record format

For every answered question, record: decision, owner, date, affected API/data contract, migration stage, and rollback consequence. Do not encode an answer only in UI code.
