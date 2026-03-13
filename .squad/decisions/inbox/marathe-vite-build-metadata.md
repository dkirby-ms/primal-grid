## 2026-03-13: Vite Build Metadata for Footer Version

**Author:** Marathe  
**Issue:** #188  
**Status:** Accepted

### Decision

Frontend build metadata for the footer should come from Vite environment variables, not `define`-injected globals guarded by `typeof` checks.

- `client/src/buildMeta.ts` reads `import.meta.env.VITE_APP_VERSION` and `import.meta.env.VITE_BUILD_DATE`
- Production falls back to the root `package.json` version if `VITE_APP_VERSION` is missing
- Local `npm run dev` always shows `vdev`
- Deploy workflows must pass `VITE_APP_VERSION` and `VITE_BUILD_DATE` into Docker builds

### Rationale

The previous footer logic depended on `typeof __APP_VERSION__ !== 'undefined'`, which left production bundles able to fall back to `vdev`. Using Vite env metadata makes the production path explicit in CI/CD while keeping local development behavior intentional.

### Implementation Notes

- `.github/workflows/deploy.yml`
- `.github/workflows/deploy-uat.yml`
- `Dockerfile`
- `client/src/buildMeta.ts`
- `client/src/main.ts`
