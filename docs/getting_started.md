# Getting started

## Docker path

Install Docker Desktop with the shared Dream edge network available, then run:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
docker compose --profile dev up -d --build
```

Open `https://store.prg32.dream.test` and use
`https://api.prg32.dream.test/ready` to confirm the API.

## Direct path

```bash
pnpm --dir backend dev
NEXT_PUBLIC_PRG32_API_ORIGIN=http://127.0.0.1:5090 pnpm --dir frontend dev
```

The first administrator is created through the one-time `/auth/bootstrap`
endpoint. Keep the bootstrap token outside source control.

## Before sharing a change

Run the complete validation list in [Development](development.md), inspect
`git diff --check`, and confirm no operational data or credentials are staged.
