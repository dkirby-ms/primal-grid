# Primal Grid — Deployment Guide

## Architecture Overview

Primal Grid runs as a **single container** on Azure Container Apps. The Node.js process serves both the Colyseus WebSocket game server and the static client assets (Vite build output) via Express.

```
Client Browser
    │
    ├── HTTPS ──→ Static assets (Express)
    └── WSS ───→ Colyseus WebSocket (same port)
           │
   Azure Container Apps (single container, port 2567)
```

- **Runtime:** Node.js 20 (Alpine)
- **Server:** Express + Colyseus 0.15 with WebSocketTransport
- **Client:** HTML5 Canvas app built by Vite, served as static files from `/public`
- **Infra-as-Code:** Bicep (`infra/main.bicep`)
- **CI/CD:** GitHub Actions with OIDC authentication

## Required GitHub Secrets

Configure these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `AZURE_CLIENT_ID` | App registration client ID (for OIDC federated auth) |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |
| `ACR_NAME` | Azure Container Registry name (e.g. `primalgridacr`) |
| `CONTAINER_APP_NAME` | Container App resource name (e.g. `primal-grid`) |
| `RESOURCE_GROUP` | Azure resource group name |

> **Note:** No client secrets are stored. Authentication uses OIDC workload identity federation (`azure/login@v2`). The Azure AD app registration must have a federated credential configured for the `master` branch of this repository.

## Provisioning Azure Infrastructure

### Prerequisites

- Azure CLI installed (`az --version`)
- Logged in (`az login`)
- A resource group created (`az group create --name <rg-name> --location <region>`)

### Deploy with Bicep

```bash
az deployment group create \
  --resource-group <rg-name> \
  --template-file infra/main.bicep \
  --parameters acrName=<acr-name>
```

This creates:
- Azure Container Registry (Basic tier)
- Log Analytics workspace
- Container Apps Environment (Consumption plan)
- Container App (0.25 vCPU / 0.5 GB RAM, external HTTPS ingress on port 2567)

### OIDC Setup (one-time)

1. Create an Azure AD app registration
2. Add a federated credential scoped to `repo:<owner>/<repo>:ref:refs/heads/master`
3. Grant the app `AcrPush` role on the ACR and `Contributor` role on the resource group
4. Store the client ID, tenant ID, and subscription ID as GitHub secrets

## Triggering a Deployment

Push to the `master` branch:

```bash
git push origin master
```

The GitHub Actions pipeline (`.github/workflows/deploy.yml`) will:

1. **Test** — Install dependencies, run `npm test`
2. **Deploy** — Build Docker image, push to ACR (tagged with commit SHA), update Container App

The deployed URL is printed in the workflow summary.

## Local Docker Testing

### Build

```bash
docker build -t primal-grid .
```

### Run

```bash
docker run -p 2567:2567 primal-grid
```

Open [http://localhost:2567](http://localhost:2567) — the game should be playable with grid rendering, player movement, and creature spawning.

### Verify

```bash
# Health check — static assets served
curl -s http://localhost:2567/ | head -c 100

# WebSocket — Colyseus endpoint available
curl -s -o /dev/null -w "%{http_code}" http://localhost:2567/
```

## Local Development (without Docker)

```bash
npm ci --workspaces
npm run dev
```

This starts the Vite dev server (client) and Colyseus server concurrently. The client connects to `ws://localhost:2567` by default.
