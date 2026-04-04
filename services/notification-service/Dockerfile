FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install -g pnpm && pnpm install
COPY src ./src
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install -g pnpm && pnpm install --prod
COPY --from=builder /app/dist ./dist
EXPOSE 3007
CMD ["node", "dist/index.js"]
