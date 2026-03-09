---
name: "overlay-panel"
description: "Reusable scrolling overlay panel pattern for game UI (log, chat, etc.)"
domain: "ui"
confidence: "high"
source: "earned — first used in #31 game log overlay, designed for extraction by #30 chat"
---

## Context
The game uses DOM-based overlay panels (not PixiJS) for scrolling text content like game logs and chat. This pattern provides: header bar, scrollable message area, smart auto-scroll with scroll-back, and entry pruning.

## Pattern

### DOM Structure
```html
<div id="panel-container">
  <!-- JS builds internal structure: -->
  <!-- .panel-header (title bar, flex-shrink: 0) -->
  <!-- .panel-scroll (overflow-y: auto, fixed height) -->
</div>
```

### Smart Auto-Scroll
Track whether the user has scrolled up to read history. Only auto-scroll on new entries if user is "following the tail" (within threshold of bottom).

```typescript
const AUTO_SCROLL_THRESHOLD_PX = 30;
private userScrolledUp = false;

// In init():
this.scrollArea.addEventListener('scroll', () => {
  const { scrollTop, scrollHeight, clientHeight } = this.scrollArea;
  this.userScrolledUp =
    scrollHeight - scrollTop - clientHeight > AUTO_SCROLL_THRESHOLD_PX;
});

// In addEntry():
if (!this.userScrolledUp) {
  this.scrollArea.scrollTop = this.scrollArea.scrollHeight;
}
```

### Entry Pruning
Keep a fixed cap of entries. Remove oldest (firstChild) when over the limit.

```typescript
while (this.entryCount > MAX_ENTRIES && this.scrollArea.firstChild) {
  this.scrollArea.removeChild(this.scrollArea.firstChild);
  this.entryCount--;
}
```

### CSS Styling (dark theme)
- Container: flex column, `background: #1a1a2e`, `border: 1px solid #2a2a4a`
- Header: `padding: 4px 10px`, `font-size: 10px`, uppercase, `color: #888`
- Scroll area: fixed height, custom scrollbar (`width: 6px`, `#3a3a5a` thumb)
- Entries: flex row with gap, `line-height: 1.6`, text-overflow ellipsis

## When to Use
- Any scrolling text panel in the game UI (log, chat, notifications)
- DOM-based (not canvas) for text rendering performance and accessibility

## Reference Implementation
- `client/src/ui/GameLog.ts` — Full implementation with category styling
- `client/index.html` — CSS styles (search for `game-log`)

## Anti-Patterns
- Don't put scroll tracking on the outer container — put it on the inner scroll area
- Don't use `innerHTML` for entries — use `createElement` for security and performance
- Don't remove the scroll listener — it must stay active for the scroll-back feature
