FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY package.json ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN pnpm db:generate
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src/generated ./src/generated
EXPOSE 3004
CMD ["node", "dist/index.js"]
