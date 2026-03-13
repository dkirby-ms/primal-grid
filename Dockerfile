# Stage 1: Build
FROM node:22-alpine AS build

ARG VITE_APP_VERSION
ARG VITE_BUILD_DATE

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
RUN if [ -z "$VITE_APP_VERSION" ]; then \
      VITE_APP_VERSION=$(node --print "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version"); \
    fi && \
    if [ -z "$VITE_BUILD_DATE" ]; then \
      VITE_BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
    fi && \
    export VITE_APP_VERSION VITE_BUILD_DATE && \
    npm run build -w shared && npm run build -w server && npm run build -w client

# Stage 2: Production
FROM node:22-alpine

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
