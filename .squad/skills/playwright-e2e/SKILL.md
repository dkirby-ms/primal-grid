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
if (import.meta.env.DEV || new URLSearchParams(window.location.search).has('dev')) {
  (window as any).__ROOM__ = room;
}
```

## When to Use
- Canvas game with WebSocket multiplayer (Colyseus, Socket.io)
- Need to verify game state, not pixel colors
- Testing player interactions (join, combat, resource changes)

## Gotchas
- `workers: 1` mandatory — multiplayer tests share server state
- Colyseus uses binary protocol — cannot inspect WebSocket frames for state
- Server ticks at fixed Hz — use generous timeouts, never `setTimeout`
- HQ placement is random — always read coordinates from state
