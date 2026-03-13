---
name: "vite-build-metadata"
description: "Inject footer/version metadata into Vite builds in CI, Docker, and local dev without leaking dev fallbacks into production"
domain: "ci-cd"
confidence: "high"
source: "earned"
---

## Context

Use this pattern when frontend code needs immutable build metadata such as version or build date, and the same client bundle is built locally, in Docker, and in GitHub Actions.

## Patterns

### Build metadata module

Create a small client-side module (for example `client/src/buildMeta.ts`) that reads `import.meta.env.VITE_*` values and centralizes the fallback rules.

- In production builds, prefer `import.meta.env.VITE_APP_VERSION`
- Fall back to the root `package.json` version if the env var is absent
- In local `npm run dev`, force a clear dev marker like `vdev`

### CI/Docker handoff

Pass the metadata explicitly from workflows into Docker:

- Workflow computes `VITE_APP_VERSION` from root `package.json`
- Workflow computes `VITE_BUILD_DATE` with `date -u +%Y-%m-%dT%H:%M:%SZ`
- `docker build` passes both via `--build-arg`
- `Dockerfile` exports them before `npm run build -w client`

## Examples

- `client/src/buildMeta.ts`
- `.github/workflows/deploy.yml`
- `.github/workflows/deploy-uat.yml`
- `Dockerfile`

## Anti-Patterns

- **`typeof` guards around Vite-injected globals** — they can leave production code on a dev fallback path
- **Implicit metadata sources** — if CI/CD does not pass build metadata explicitly, production version display becomes harder to reason about and debug
