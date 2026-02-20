FROM node:22-alpine AS builder

RUN corepack enable pnpm

WORKDIR /monorepo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/

RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @chess/web build

FROM alpine:3.20
COPY --from=builder /monorepo/apps/web/dist /dist
COPY apps/web/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
