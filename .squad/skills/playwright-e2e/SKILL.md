# Skill: Playwright E2E for Canvas Multiplayer Games

## Pattern
Test multiplayer canvas games (PixiJS + Colyseus) using state-based assertions via `page.evaluate()` reading exposed `window.__ROOM__` reference, with browser contexts for player isolation.

## Key Techniques

### Custom Fixture with joinGame()
```typescript
export const test = base.extend<{ playerOne: PlayerPage; playerTwo: PlayerPage }>({
  playerOne: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await joinGame(page, 'Alice');
    await use({ context: ctx, page, playerName: 'Alice' });
    await ctx.close();
  },
});
```

### State Assertions (Primary)
```typescript
await page.waitForFunction((expected) => {
  const room = (window as any).__ROOM__;
  return room?.state?.players?.size >= expected;
}, count, { timeout: 15_000 });
```

### Expose Room Reference (Dev-Gated)
```typescript
// In network.ts — export a strict check
export function isDevMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('dev') === '1' || params.get('devmode') === '1';
}

// Gate exposure to dev server OR URL param
if (import.meta.env.DEV || isDevMode()) {
  (window as any).__ROOM__ = room;
}
```

> ⚠️ **Security note:** The `?dev=1` URL param is user-controllable and will work in production builds. If your game uses the same dev flag server-side (e.g., to disable fog of war), consider using ONLY `import.meta.env.DEV` for client-side exposure and a server-side auth check for privileged debug features. For this project, the URL param approach is acceptable in early development but should be replaced with authenticated debug endpoints before public release.

## When to Use
- Canvas game with WebSocket multiplayer (Colyseus, Socket.io)
- Need to verify game state, not pixel colors
- Testing player interactions (join, combat, resource changes)

## Gotchas
- `workers: 1` mandatory — multiplayer tests share server state
- Colyseus uses binary protocol — cannot inspect WebSocket frames for state
- Server ticks at fixed Hz — use generous timeouts, never `setTimeout`
- HQ placement is random — always read coordinates from state
