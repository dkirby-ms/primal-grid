# Marathe — History

## Project Context

- **Project:** Primal Grid — grid-based survival colony builder with dinosaurs, ecosystem simulation, and base automation
- **Stack:** TypeScript, Colyseus (server), PixiJS (client), Playwright (E2E tests), Vite (bundler)
- **Owner:** dkirby-ms
- **Repo structure:** Monorepo with `client/`, `server/`, `shared/`, `e2e/`, `infra/`
- **Default branch:** `dev`
- **Key workflows:** `.github/workflows/e2e.yml` (E2E tests + GitHub Pages report publishing)

## Learnings

- GitHub Pages deployment added to E2E workflow — publishes HTML reports on every `dev` push (even on test failure)
- Playwright config uses dual reporters in CI: `[['github'], ['html']]` for both Actions annotations and HTML reports
- Shared package must be built before server (`npm run build -w shared`) — stale `tsconfig.tsbuildinfo` can cause runtime bugs
- E2E tests use `workers: 1` (serial) with a single shared Colyseus server instance
