FROM node:22-alpine AS builder

RUN corepack enable pnpm

WORKDIR /monorepo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./

COPY packages/tsconfig/ packages/tsconfig/
COPY packages/shared/package.json packages/shared/package.json

COPY apps/web/package.json apps/web/package.json
COPY apps/tma/package.json apps/tma/package.json
COPY services/crdt-server/package.json services/crdt-server/package.json

RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/

RUN pnpm --filter @chess/web build

FROM alpine:3.20
COPY --from=builder /monorepo/apps/web/dist /dist
COPY apps/web/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
