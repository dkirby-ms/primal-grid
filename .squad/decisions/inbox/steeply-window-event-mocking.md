# Decision: Window Event Mocks Must Capture Callbacks

**Author:** Steeply (Tester)
**Date:** 2026-03-10
**Context:** PR #103 review revealed that `window.addEventListener` was mocked as a no-op `vi.fn()`, silently hiding the entire `pageUnloading` code path from test coverage.

**Decision:** In client-side tests that import modules registering `window.addEventListener` callbacks at module load time, the mock must capture callbacks by event name so they can be invoked in tests. A no-op mock is not acceptable — it creates invisible coverage gaps.

**Pattern:**
```typescript
const windowEventCallbacks: Record<string, Array<(...args: unknown[]) => void>> = {};
vi.stubGlobal('window', {
  addEventListener: vi.fn((event: string, cb) => {
    if (!windowEventCallbacks[event]) windowEventCallbacks[event] = [];
    windowEventCallbacks[event].push(cb);
  }),
  // ...
});
```

Reset `windowEventCallbacks` in `beforeEach` to avoid cross-test leakage.
