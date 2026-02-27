# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

RUN npm ci --workspaces

# Copy source and config
COPY tsconfig.json ./
COPY shared/ shared/
COPY server/ server/
COPY client/ client/

# Build in dependency order: shared → server → client
RUN npm run build -w shared && npm run build -w server && npm run build -w client

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

RUN npm ci --workspaces --omit=dev

# Copy built artifacts
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist public/

EXPOSE 2567

CMD ["node", "server/dist/index.js"]
