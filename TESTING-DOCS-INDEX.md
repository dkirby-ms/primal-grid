# Primal Grid Testing Documentation Index

This directory contains comprehensive documentation for setting up a Playwright-based testing framework for the primal-grid client-side application.

## 📚 Documents Overview

### 1. **TESTING-ARCHITECTURE.md** (Comprehensive Technical Reference)
**15 KB | Detailed 8-point analysis**

Covers all aspects of the client architecture needed for testing:

1. **Server Connection & Networking** — Colyseus SDK, WebSocket URLs, room joining
2. **Game URL & Entry Point** — Vite config, index.html structure, query parameters
3. **Multi-Player Room Joining** — Session IDs, state structures, event listeners
4. **Current Test Setup** — Vitest config, existing camera zoom test patterns
5. **Dev Mode (?dev=1)** — How it works, URL detection, testing benefits
6. **Game Rendering** — PixiJS architecture, renderer components, pipeline
7. **Client Dependencies** — package.json details, no Playwright yet
8. **UI & DOM Interaction** — HUD panels, modals, input handlers

**Read this for:** Complete technical reference with code snippets and file paths.

---

### 2. **TESTING-QUICK-REF.md** (At-a-Glance Reference)
**3.5 KB | Quick lookup tables**

Fast reference for common information:

- Essential URLs & ports (localhost:3000, localhost:2567)
- Key technologies (Colyseus, PixiJS, Vitest)
- Important file locations (with descriptions)
- Dev mode activation
- Rendering pipeline
- State structures
- Canvas controls
- Command reference
- Next steps

**Read this for:** Quick lookups during test development (bookmark this!).

---

### 3. **ARCHITECTURE-DIAGRAMS.md** (Visual References)
**15 KB | ASCII diagrams and flow charts**

Visual representations of system flows:

1. **Connection Flow** — Browser → WebSocket → Game Server
2. **Client Architecture Layers** — DOM structure, input, rendering, networking
3. **Rendering Pipeline** — PixiJS stage hierarchy with all layers
4. **State Synchronization** — Server state → Client state → Renderers
5. **Multiplayer Flow** — Multi-client interaction via Colyseus
6. **Name Prompt & Join** — Login flow to playable game
7. **Camera Control** — Input → Camera state → Visual output
8. **Dev Mode Detection** — URL parsing → mode activation
9. **Test Scenarios** — Example single-player and multiplayer tests
10. **Keyboard & Mouse Map** — All input bindings

**Read this for:** Understanding system architecture visually.

---

### 4. **PLAYWRIGHT-SETUP-GUIDE.md** (Implementation Strategy)
**8 KB | Setup instructions and recommendations**

Actionable guide for implementing Playwright testing:

- Document overview (what's here)
- Key findings summary (8 critical aspects)
- Recommended implementation strategy (5 phases)
- Running tests with Playwright
- CI/CD integration
- Architecture reference points
- Query selectors for testing
- Network/state assertion methods

**Read this for:** Planning and implementing your Playwright test suite.

---

## 🎯 Quick Start

### To understand the architecture:
1. Start with **TESTING-QUICK-REF.md** (3 min read)
2. Skim **ARCHITECTURE-DIAGRAMS.md** (connection flow + rendering pipeline)
3. Refer to **TESTING-ARCHITECTURE.md** as needed

### To set up Playwright testing:
1. Read **PLAYWRIGHT-SETUP-GUIDE.md** thoroughly
2. Follow Phase 1-3 (setup and basic tests)
3. Use **TESTING-QUICK-REF.md** for selector/state references
4. Reference **TESTING-ARCHITECTURE.md** for detailed implementation

### To write specific tests:
1. **For connectivity:** See section 1 of TESTING-ARCHITECTURE.md
2. **For rendering:** See section 6 (Game Rendering)
3. **For UI:** See section 8 (UI & DOM Interaction)
4. **For multiplayer:** See section 3 (Multi-Player Room Joining)
5. **For dev mode:** See section 5 (Dev Mode)

---

## 📋 Quick Facts

| Aspect | Value |
|--------|-------|
| Client Dev Server | http://localhost:3000 |
| Server WebSocket | ws://localhost:2567 |
| Canvas Size | 600×600 pixels |
| Canvas Library | PixiJS 8.0.0 |
| Networking | Colyseus SDK 0.17.26 |
| Room Name | "game" (fixed) |
| Player ID | room.sessionId (unique per connection) |
| Test Framework | Vitest (no Playwright yet) |
| Dev Mode Activation | ?dev=1 or ?devmode=1 |
| Test Example | client/src/__tests__/camera-zoom.test.ts |

---

## 🔍 Finding Information by Topic

### Connection & Networking
- **TESTING-ARCHITECTURE.md** → Section 1
- **TESTING-QUICK-REF.md** → "Essential URLs & Ports", "Room & Multiplayer"
- **ARCHITECTURE-DIAGRAMS.md** → Connection Flow diagram

### Game Rendering
- **TESTING-ARCHITECTURE.md** → Section 6
- **ARCHITECTURE-DIAGRAMS.md** → Rendering Pipeline diagram, Client Architecture Layers

### Multiplayer Testing
- **TESTING-ARCHITECTURE.md** → Section 3
- **ARCHITECTURE-DIAGRAMS.md** → Multiplayer Flow diagram, Test Scenarios
- **PLAYWRIGHT-SETUP-GUIDE.md** → Phase 5 section

### UI Testing
- **TESTING-ARCHITECTURE.md** → Section 8
- **TESTING-QUICK-REF.md** → "Canvas Controls"
- **ARCHITECTURE-DIAGRAMS.md** → Keyboard & Mouse Map

### Dev Mode
- **TESTING-ARCHITECTURE.md** → Section 5
- **ARCHITECTURE-DIAGRAMS.md** → Dev Mode Detection diagram

### Existing Tests
- **TESTING-ARCHITECTURE.md** → Section 4
- **TESTING-QUICK-REF.md** → "Existing Tests"

---

## 💡 Key Insights for Test Planning

### Why Playwright is Perfect for This Project

✅ **PixiJS Canvas is DOM-rendered** — Not hidden in Shadow DOM, fully queryable
✅ **Colyseus room.state is accessible** — Can query game state via page.evaluate()
✅ **Dev mode (?dev=1) shows full map** — No complex scrolling/panning needed for assertions
✅ **Multiple clients work easily** — Use Playwright context for multiplayer tests
✅ **No authentication layer** — Simple name prompt, straightforward setup
✅ **RESTful architecture** — Server and client run on separate ports, easy to control

### Testing Challenges to Overcome

⚠️ **Canvas rendering** — Visual assertions require pixel/image testing
⚠️ **Smooth animation** — Creature movement is interpolated; need to wait for stable state
⚠️ **WebSocket timing** — Server state updates are async; need proper wait conditions
⚠️ **Multiple players** — Timing issues when coordinating two clients

### Recommended Solutions

✅ Use **dev mode (?dev=1)** to disable fog of war for easier assertions
✅ Wait for **room.onStateChange()** via page.evaluate() + waitForFunction()
✅ Query **room.state directly** instead of relying on visual assertions
✅ Use **Playwright context** to simulate multiple players
✅ Add **explicit waits** for server state changes before assertions

---

## 📄 File Locations

All documents are in the root of the primal-grid directory:

```
/home/saitcho/primal-grid/
├── TESTING-DOCS-INDEX.md              (this file)
├── TESTING-ARCHITECTURE.md            (comprehensive reference)
├── TESTING-QUICK-REF.md               (quick lookup)
├── ARCHITECTURE-DIAGRAMS.md           (visual flows)
├── PLAYWRIGHT-SETUP-GUIDE.md          (implementation strategy)
│
├── client/
│   ├── index.html                     (HTML entry point)
│   ├── vite.config.ts                 (dev server config)
│   └── src/
│       ├── main.ts                    (bootstrap & connection)
│       ├── network.ts                 (WebSocket/Colyseus)
│       ├── __tests__/
│       │   └── camera-zoom.test.ts    (example vitest)
│       └── ... (renderers, UI, input)
│
├── vitest.config.ts                   (test configuration)
├── package.json                       (root, includes vitest)
└── ... (server, shared packages)
```

---

## 🚀 Next Steps

1. **Review** TESTING-QUICK-REF.md (5 minute overview)
2. **Study** TESTING-ARCHITECTURE.md sections 1-3 (connection & multiplayer)
3. **Understand** ARCHITECTURE-DIAGRAMS.md (connection & rendering flows)
4. **Plan** your test strategy using PLAYWRIGHT-SETUP-GUIDE.md
5. **Start** with Phase 1-2 (setup & basic test infrastructure)
6. **Reference** TESTING-QUICK-REF.md for selectors and state access methods

---

## ✅ Documentation Quality Checklist

- ✅ All 7 user questions answered comprehensively
- ✅ Specific file paths included throughout
- ✅ Code snippets showing actual implementation
- ✅ Visual diagrams for complex flows
- ✅ Quick reference for rapid lookup
- ✅ Implementation guide for Playwright setup
- ✅ State structures fully documented
- ✅ UI interaction patterns documented
- ✅ Multiplayer architecture explained
- ✅ Dev mode benefits highlighted for testing

---

**Generated:** March 7, 2024
**Project:** Primal Grid
**Purpose:** Comprehensive client-side architecture documentation for Playwright test planning

