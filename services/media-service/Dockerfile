FROM node:22-alpine AS builder
WORKDIR /app
# Install build tools needed for sharp native bindings
RUN apk add --no-cache python3 make g++ vips-dev
COPY package.json tsconfig.json ./
RUN npm install -g pnpm && pnpm install
COPY src ./src
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
# sharp needs libvips at runtime
RUN apk add --no-cache vips
COPY package.json ./
RUN npm install -g pnpm && pnpm install --prod
COPY --from=builder /app/dist ./dist
RUN mkdir -p /app/uploads
VOLUME /app/uploads
EXPOSE 3010
CMD ["node", "dist/index.js"]
