FROM node:22-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
COPY services/order-service/package.json ./services/order-service/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @ulcp/shared build
ENV DATABASE_URL="postgresql://placeholder:placeholder@placeholder:5432/placeholder?schema=placeholder"
RUN pnpm --filter @ulcp/order-service db:generate
RUN pnpm --filter @ulcp/order-service build
RUN cp -r services/order-service/src/generated services/order-service/dist/

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/order-service/dist ./dist
COPY --from=builder /app/services/order-service/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
EXPOSE 3004
CMD ["node", "dist/index.js"]
