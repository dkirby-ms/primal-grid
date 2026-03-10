# Contributing to Primal Grid

Thanks for your interest in contributing! Here's how to get started.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/primal-grid.git`
3. Install dependencies: `npm install`
4. Create a feature branch: `git checkout -b feature/your-feature`

## Development

- **Build shared types:** `rm -f shared/tsconfig.tsbuildinfo && npx tsc --build`
- **Run server:** `npm run dev` (from `server/`)
- **Run client:** `npm run dev` (from `client/`)
- **Run tests:** `npx vitest run`
- **Lint:** `npm run lint`

> **Important:** After editing files in `shared/src/`, delete `shared/tsconfig.tsbuildinfo` before rebuilding — incremental builds may skip emitting changes to `dist/`.

## Code Style

- TypeScript strict mode — no `any` types
- Prefix intentionally unused parameters with `_` (e.g., `_state`)
- ESLint with `eslint-plugin-security` is enforced in CI
- Keep comments minimal — only where clarification is needed

## Branching Strategy

```
feature/* → dev → uat → prod
```

| Branch | Purpose | Deploys To |
|--------|---------|------------|
| `dev` | Active development | — |
| `uat` | Staging / testing | UAT environment |
| `prod` | Production (default branch) | Production environment |

### PR Review Gates

| PR Type | Target | Reviewer | Policy |
|---------|--------|----------|--------|
| Feature/fix branches → `dev` | `dev` | Hal (code review) | Merge after Hal approval |
| `dev` → `uat` | `uat` | @copilot (automated review) | Merge after copilot approval |
| `uat` → `prod` | `prod` | @dkirby-ms (manual) | Only created and merged by owner |

### Workflow

1. Create a feature branch from `dev`: `git checkout -b feature/your-feature`
2. Open a PR targeting `dev` — Hal reviews for code quality
3. After merge to `dev`, open a PR from `dev` → `uat` — @copilot reviews
4. After UAT validation, open a PR from `uat` → `prod` — @dkirby-ms merges manually

## Pull Requests

1. Make sure tests pass: `npx vitest run`
2. Make sure lint passes: `npm run lint`
3. Write a clear PR description explaining **what** and **why**
4. Reference any related issues (e.g., "Closes #7")

## Reporting Issues

Use [GitHub Issues](https://github.com/dkirby-ms/primal-grid/issues) to report bugs or request features.

### Issue Templates

- **Bug Report** — requires reproduction steps, expected vs actual, environment
- **Feature Request** — requires problem statement, motivation, proposed solution
- **Task / Chore** — lightweight template for internal maintenance work

## Architecture Notes

See the [README](README.md) for project structure and architecture overview. The codebase is split into:

- `client/` — PixiJS renderer, input handling, UI
- `server/` — Colyseus game server, creature AI, game loop
- `shared/` — Types, constants, and data definitions used by both

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
