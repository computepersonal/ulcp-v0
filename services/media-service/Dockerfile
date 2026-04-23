FROM node:22-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

FROM base AS deps
RUN apk add --no-cache python3 make g++ vips-dev
COPY package.json pnpm-lock.yaml* ./
COPY services/media-service/package.json ./services/media-service/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

FROM base AS builder
RUN apk add --no-cache python3 make g++ vips-dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @ulcp/shared build
RUN pnpm --filter @ulcp/media-service build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache vips
ENV NODE_ENV=production
COPY --from=builder /app/services/media-service/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
RUN mkdir -p /app/uploads
EXPOSE 3010
CMD ["node", "dist/index.js"]
