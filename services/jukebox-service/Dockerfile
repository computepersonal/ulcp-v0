FROM node:22-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
COPY services/jukebox-service/package.json ./services/jukebox-service/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @ulcp/shared build
ENV DATABASE_URL="postgresql://placeholder:placeholder@placeholder:5432/placeholder?schema=placeholder"
RUN pnpm --filter @ulcp/jukebox-service db:generate
RUN pnpm --filter @ulcp/jukebox-service build
RUN cp -r services/jukebox-service/src/generated services/jukebox-service/dist/

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/jukebox-service/dist ./dist
COPY --from=builder /app/services/jukebox-service/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
EXPOSE 3014
CMD ["node", "dist/index.js"]
