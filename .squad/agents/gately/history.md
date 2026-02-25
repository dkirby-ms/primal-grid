# Project Context

- **Owner:** dkirby-ms
- **Project:** Primal Grid: Survival of the Frontier — grid-based survival colony builder with dinosaurs, dynamic ecosystems, and base automation in the browser
- **Stack:** TypeScript, HTML5 Canvas, browser-based web game
- **Design Document:** docs/design-sketch.md
- **Created:** 2026-02-25T00:45:00Z

## Current Phase

**Hal (Lead)** has decomposed the design sketch into a **6-phase build plan** (2026-02-25):
- **Phase 0:** Scaffolding (Gately + Pemulis lead)
- **Phase 1–2, 4:** Core simulation, base building, world events (Gately lead)
- **Phase 3:** Creature systems (Gately lead)
- **Phase 5:** Late game + auth (Pemulis lead)

**Your Role (Gately):** Game Dev — lead Phases 0–4 (core gameplay loop). See `.squad/decisions.md` for full architecture.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### Phase 0 Scaffolding (2026-02-25)
- Created root monorepo with npm workspaces (`client`, `server`, `shared`). Root package is `@primal-grid/root`, private, ESM-only.
- Root tsconfig uses `ES2022` target, strict mode, bundler moduleResolution, project references to all three packages.
- Root devDependencies: `concurrently`, `eslint` + `@typescript-eslint`, `prettier`, `typescript`, `vitest`.
- Client package (`@primal-grid/client`): PixiJS v8 (`^8.0.0`), `colyseus.js` (`^0.15.0`), Vite 6 for bundling.
- Client `main.ts` uses PixiJS v8 async init pattern: `new Application()` then `await app.init({...})`.
- Vite dev server on port 3000, build target ES2022.
- CI pipeline: GitHub Actions on push/PR to `main` — checkout, Node 20, `npm ci`, lint, typecheck, build, test.
- ESLint config is CJS (`.eslintrc.cjs`) since root package is `type: module`.
- Prettier: single quotes, trailing commas, 2-space indent, 100 char width.
- `.gitignore` covers: `node_modules/`, `dist/`, `.env`, `*.tsbuildinfo`, `coverage/`.
- Files created: `package.json`, `tsconfig.json`, `.eslintrc.cjs`, `.prettierrc`, `.editorconfig`, `.gitignore`, `.github/workflows/ci.yml`, `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/index.html`, `client/src/main.ts`.
