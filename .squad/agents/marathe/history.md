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
- Discord notifications added to E2E workflow — `discord-notify` job posts rich embeds via `DISCORD_WEBHOOK_URL` secret after tests complete
- deploy-report job exposes `page_url` output so downstream jobs can link to the GitHub Pages report
- Used `jq` for JSON payload construction in CI to safely escape dynamic content (commit messages, PR titles)
- Discord webhook skill: color 5763719 = green, 15548997 = red; HTTP 204 = success; use `"username": "Squad: Marathe"` for attribution
