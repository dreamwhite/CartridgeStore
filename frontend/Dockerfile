FROM node:24-bookworm-slim AS dependencies

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM node:24-bookworm-slim AS builder

ENV NEXT_TELEMETRY_DISABLED=1

ARG PRG32_API_UPSTREAM
ARG FLASK_PROXY_TARGET
ENV PRG32_API_UPSTREAM=${PRG32_API_UPSTREAM}
ENV FLASK_PROXY_TARGET=${FLASK_PROXY_TARGET}

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm run build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

CMD ["node", "server.js"]
