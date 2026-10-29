# syntax=docker/dockerfile:1
# One Dockerfile for every V0 backend service. Build context = repo root.
#   docker build -f docker/service.Dockerfile --build-arg SERVICE=order-service .
FROM node:22-alpine AS base
# openssl: required by the Prisma query engine on Alpine
RUN apk add --no-cache openssl && npm install -g pnpm@9
ENV HUSKY=0
WORKDIR /app

FROM base AS build
ARG SERVICE
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY services/${SERVICE}/package.json services/${SERVICE}/
# Only this service and its workspace dependencies (@ulcp/shared) are installed
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "@ulcp/${SERVICE}..."
COPY packages/shared packages/shared
COPY services/${SERVICE} services/${SERVICE}
RUN pnpm --filter @ulcp/shared build
RUN if [ -f services/${SERVICE}/prisma/schema.prisma ]; then \
      DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=build" \
      pnpm --filter "@ulcp/${SERVICE}" exec prisma generate; \
    fi
RUN pnpm --filter "@ulcp/${SERVICE}" build
# tsc does not copy the generated Prisma client (with its native engine) into dist
RUN if [ -d services/${SERVICE}/src/generated ]; then cp -r services/${SERVICE}/src/generated services/${SERVICE}/dist/; fi

FROM node:22-alpine AS runtime
ARG SERVICE
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
# Same relative layout as the workspace so pnpm's symlinks keep resolving
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/services/${SERVICE} ./services/${SERVICE}
COPY docker/service-entrypoint.sh /usr/local/bin/service-entrypoint.sh
RUN chmod +x /usr/local/bin/service-entrypoint.sh
WORKDIR /app/services/${SERVICE}
USER node
ENTRYPOINT ["service-entrypoint.sh"]
