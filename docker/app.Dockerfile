# syntax=docker/dockerfile:1
# One Dockerfile for every V0 frontend: Node builds static files, Caddy serves them (no Node at runtime).
#   docker build -f docker/app.Dockerfile --build-arg APP=onboarding --build-arg BASE_PATH=/onboarding .
FROM node:22-alpine AS build
RUN npm install -g pnpm@9
ENV HUSKY=0
WORKDIR /app
ARG APP
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/${APP}/package.json apps/${APP}/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "@ulcp/${APP}..."
COPY apps/${APP} apps/${APP}
# VITE_* values are baked in at build time. Empty = relative URLs, so the same image works
# behind any gateway origin (/api/v1/..., /socket.io). Keep these empty.
ENV VITE_IDENTITY_SERVICE_URL="" VITE_TENANT_SERVICE_URL="" VITE_CATALOGUE_SERVICE_URL="" \
    VITE_ORDER_SERVICE_URL="" VITE_REALTIME_SERVICE_URL="" VITE_WEB_APP_URL="" \
    VITE_KDS_URL="/kds/"
RUN pnpm --filter "@ulcp/${APP}" build

FROM caddy:2-alpine
ARG APP
ARG BASE_PATH=
COPY --from=build /app/apps/${APP}/dist /srv${BASE_PATH}
RUN printf ':80 {\n\troot * /srv\n\tencode gzip\n\t@assets path %s/assets/*\n\theader @assets Cache-Control "public, max-age=31536000, immutable"\n\ttry_files {path} %s/index.html\n\tfile_server\n}\n' "${BASE_PATH}" "${BASE_PATH}" > /etc/caddy/Caddyfile
EXPOSE 80
