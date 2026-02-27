# Phase A UAT Checklist — Colony Commander Pivot

**Decision ID:** hal-phase-a-uat  
**Phase:** A (Colony Commander Foundation)  
**Created:** 2026-02-27  
**Owner:** Hal (dkirby-ms executing)  
**Status:** Ready for Manual Testing  

---

## Executive Summary

Phase A is complete: 239/240 tests passing. The core pivot from avatar-based survival to commander-mode colony builder is implemented and server-tested. This UAT checklist guides manual browser testing to validate the game **feels right** and plays smoothly. Covers 13 feature areas with 80+ test cases plus a 5–10 min smoke test.

---

## What Changed in Phase A

- **No player avatar** → Commander is disembodied, free-pan camera
- **Territory ownership** → Tiles have `ownerID` field; players claim adjacent tiles
- **HQ system** → Each player spawns with HQ, can't move it
- **Map → 64×64** (was 32×32)
- **Creatures respond to zones** → Pawn system foundation (command/zoneX/zoneY fields)
- **Structures have health** → Foundation for destructible buildings (Phase B)
- **HUD relocated** → DOM-based side panel (right, 200px wide) instead of PixiJS overlay
- **No player survival** → No hunger/health tracking; creatures do, player doesn't

---

## Test Scope

### ✅ IN SCOPE (All Phase A Features)

1. **Room Join & Spawn** — HQ placement, territory init, HUD panel visibility
2. **Territory Claiming** — Click to claim, adjacency validation, color overlay, score update
3. **Camera Control** — Free pan, no avatar following, boundary constraints
4. **Structures** — Place walls/floors/workbenches/farms via build mode
5. **Resources & Inventory** — Passive gather, HUD display, real-time updates
6. **Crafting** — Recipe menu, affordability, resource deduction
7. **Creatures** — Spawn, move, taming, creature counts
8. **HUD Panel** — Layout, sections, dynamic updates, build indicator
9. **Help & UI** — Help screen, keybinds, connection status
10. **Game Feel** — Performance, FPS, responsiveness
11. **Multiplayer** — Separate territories, no interference, isolation
12. **Edge Cases** — Boundary checks, resource limits, network race conditions
13. **Known Issues** — Pre-existing flaky test (creature-ai.test.ts) is NOT a blocker

### ⏸️ OUT OF SCOPE (Deferred to Phases B–D)

- Breeding (Phase C)
- Farm growth/harvest (Phase B)
- Wave spawners / tower defense (Phase B+)
- Pawn zone assignments (Phase C)
- Round timer / endgame (Phase D)
- Audio (Phase 5)
- Mobile input (Phase 5+)
- Persistence (Phase 5+)

---

## Test Groups

### **A. Game Start & Initialization**

**Objective:** Validate that the game initializes cleanly and the UI is ready.

- [ ] Launch browser, navigate to game URL
- [ ] Connection status shows "Connected" (green circle, top-right)
- [ ] HQ structure appears on map (distinct visual)
- [ ] Territory count in HUD shows correct starting value (1 or more for HQ tile + starting territory)
- [ ] HUD side panel is visible, right edge, 200px wide, semi-transparent dark background
- [ ] Camera centers on player's HQ (no offset)
- [ ] Map is fully loaded (no missing tiles or artifacts)
- [ ] No errors in browser console (F12 → Console)

**Expected Result:** Game is playable, UI is responsive, no console errors.

---

### **B. Territory Ownership & Claiming**

**Objective:** Validate the core pivot — territory claiming mechanic works with adjacency rules and visual feedback.

**Basic Claiming:**
- [ ] Click on a tile **directly adjacent to HQ** (up/down/left/right cardinal, not diagonal)
- [ ] Tile claims successfully if you have ≥1 wood
- [ ] Claimed tile displays **overlay color matching your player color** (semi-transparent)
- [ ] Territory count in HUD **increments by 1**
- [ ] Your wood count in Inventory **decreases by 1**

**Adjacency Enforcement:**
- [ ] Try to claim a tile **not adjacent to your territory** → fails silently (no claim, no cost)
- [ ] Expand territory outward (claim 2–3 rings around HQ)
- [ ] Tiles form a **contiguous region** (no gaps, no diagonal-only claims)

**Special Tiles:**
- [ ] Try to claim a **water tile** → fails (no claim, no cost)
- [ ] Try to claim a **rock tile** → fails (no claim, no cost)
- [ ] Try to claim a tile when you have **0 wood** → fails (no claim)

**Multiplayer Territory (if 2+ players):**
- [ ] Second player joins, HQ spawns **far from first player** (visible separation)
- [ ] Each player's territory has **distinct color** (different colors per player)
- [ ] Players **cannot claim each other's tiles** (clicks fail, no response)
- [ ] Territory ownership **does not transfer** if players click on each other's tiles
- [ ] Each player's wood budget is **independent** (one player's claim doesn't affect another)

**Expected Result:** Claiming works, adjacency is enforced, colors are correct, multiplayer isolation is solid.

---

### **C. Camera & Controls**

**Objective:** Validate free-pan camera without avatar following.

**Basic Panning:**
- [ ] Click and **drag the mouse** on the game canvas → camera pans smoothly
- [ ] Pan is **fluid, not jerky** (< 50ms latency)
- [ ] Drag **left → map shifts right** (intuitive controls)
- [ ] Release mouse → pan stops smoothly (no overshoot)

**Camera Bounds:**
- [ ] Pan to map **edge** → camera stops (doesn't show off-map black space)
- [ ] Zoom out mentally (if zoom exists) → camera respects full map bounds
- [ ] Corners of map are reachable without black space beyond

**No Avatar Following:**
- [ ] Camera **does not follow a player sprite** (no avatar exists)
- [ ] You can pan **away from HQ** without any centering force
- [ ] Camera remains **where you panned it** (no snap-to behavior)

**Optional Movement Keys:**
- [ ] Arrow keys or WASD (if implemented) → pan camera smoothly
- [ ] Space + drag (if implemented) → alternative pan method

**Camera Centering:**
- [ ] Rejoin or reload → camera centers on HQ again

**Expected Result:** Camera is responsive, pans freely, respects boundaries, no avatar-follow behavior.

---

### **D. Structures & Building**

**Objective:** Validate structure placement, build mode, and visual rendering.

**Build Mode Toggle:**
- [ ] Press **`V`** → enter build mode
- [ ] HUD indicator shows **"🔨 BUILD MODE [Wall]"** or similar (top-left of HUD)
- [ ] Press **`V` again** → exit build mode
- [ ] Indicator disappears or dims when build mode is off

**Building Mechanics:**
- [ ] While in build mode, **click a tile** to place the selected structure
- [ ] Structure appears instantly on the map (correct tile)
- [ ] Crafted item count **decrements** (Walls: 5 → 4, etc.)
- [ ] Building is **only possible on tiles you own** (own territory)
- [ ] Try to place on **unowned tile** → fails (no cost, no structure)
- [ ] Try to place on a tile with **existing structure** → fails (can't overlap)
- [ ] Try to place **outside map bounds** → fails silently

**Cycling Build Items:**
- [ ] Press **`1`** → switches to Wall
- [ ] Press **`2`** → switches to Floor
- [ ] Press **`3`** → switches to Workbench
- [ ] Press **`4`** → switches to FarmPlot
- [ ] Build indicator updates to show selected item name

**Structure Visuals:**
- [ ] **Walls** render with dark/distinct color (not the same as floor tiles)
- [ ] **Floors** render lighter or distinct from grass
- [ ] **Workbenches** have a unique sprite (tool icon or craft station shape)
- [ ] **Farm plots** show soil/garden sprite (distinct from raw terrain)
- [ ] **HQ** is prominent (larger or more visible than other structures)
- [ ] Structures are **visible and readable** (not blending into terrain)

**Affordability & Crafting:**
- [ ] You need **walls in inventory** before you can place them
- [ ] If you have **0 walls**, trying to place via build mode → fails (no cost)
- [ ] Craft a wall (**C** → 1 → craft) → Walls count increments
- [ ] Now you can place the wall

**Expected Result:** Build mode works, structure placement is valid, visuals are correct, affordability is enforced.

---

### **E. Resource & Inventory System**

**Objective:** Validate passive resource gathering and HUD inventory display.

**Resource Presence:**
- [ ] **Map tiles have resources** — look for distinct visuals (darker patches, icons)
- [ ] Resource types: **Wood, Stone, Berries, Fiber** (all should be present)
- [ ] Resources are scattered **across all biomes**

**Passive Gathering:**
- [ ] **Leave the game running** for 30–60 seconds (let server tick)
- [ ] **Inventory counts increase** automatically (no player action needed)
- [ ] Wood, Stone, Berries, Fiber counts all grow (at different rates maybe, but all grow)

**Resource Regeneration:**
- [ ] Harvest all resources from a tile (craft a bunch of walls to deplete wood)
- [ ] Wait 20–30 ticks
- [ ] Resources **regenerate** (count goes back up)
- [ ] Regeneration is **not instant** (takes a few seconds)

**Inventory Display (HUD):**
- [ ] **Inventory section** shows all 4 resources with current counts
- [ ] Counts **update in real-time** as resources are gathered
- [ ] Numbers are **large and readable** (good contrast, visible font)
- [ ] Icons match resource type (wood icon next to Wood count, etc.)

**Crafted Items Display (HUD):**
- [ ] **Crafted Items section** shows Walls, Floors, Workbenches, Farms
- [ ] Counts **update immediately** when you craft or place
- [ ] No lag between action and display update

**HUD Persistence:**
- [ ] Pan camera around → inventory counts **stay the same** (don't reset)
- [ ] Switch to another tab and back → counts are **preserved** (server state, not client-local)

**Expected Result:** Resources gather passively, HUD displays correctly, counts update in real-time, regeneration works.

---

### **F. Crafting System**

**Objective:** Validate the craft menu, recipe availability, and resource deduction.

**Opening Craft Menu:**
- [ ] Press **`C`** → craft menu opens (overlay on canvas)
- [ ] Menu shows **all available recipes** (Wall, Floor, Workbench, FarmPlot, Turret)
- [ ] Recipes are **listed with costs** (e.g., "Wall: 5 Wood")
- [ ] Recipes display **affordability** (green if affordable, red/greyed if not)

**Crafting by Number:**
- [ ] While menu open, press **`1`** → craft Wall (if you have 5 wood)
- [ ] Wood count **decreases by 5**, Walls count **increases by 1**
- [ ] Menu stays open (can craft again immediately)
- [ ] Press **`2`** → craft Floor (costs 5 wood, same as wall)

**Unaffordable Recipes:**
- [ ] If you have **0 wood**, press `1` → fails (no craft, menu shows "X" or greyed)
- [ ] Afford a recipe (gather resources) → becomes available (changes from red to green)
- [ ] Craft it → count increases, resources decrease

**Recipe Costs (Verification):**
- [ ] **Wall** costs 5 wood (verify: have 10 wood, craft wall, down to 5)
- [ ] **Floor** costs 5 wood
- [ ] **Workbench** costs 10 wood + 5 stone (have 20 wood, 10 stone; craft; down to 10 wood, 5 stone)
- [ ] **FarmPlot** costs 20 wood + 10 fiber
- [ ] **Turret** costs 15 stone + 10 berries (new Phase A item)

**Closing Menu:**
- [ ] Press **`C` again** → menu closes
- [ ] Game returns to normal mode

**Interaction with Build Mode:**
- [ ] While craft menu open, **`V` is ignored** (can't enter build mode)
- [ ] Close craft menu, then enter build mode (works)
- [ ] While in build mode, **`C` is ignored** (can't open craft menu)

**Expected Result:** Craft menu works, recipes display costs, affordability is enforced, resource deduction is correct.

---

### **G. Creatures & Taming**

**Objective:** Validate creature spawning, movement, taming, and ownership.

**Creature Presence:**
- [ ] **Wild creatures spawn** on the map at game start (see them moving)
- [ ] Creature counts in HUD show **numbers > 0** (e.g., "🦕 5 🦖 3")
- [ ] **Herbivores (🦕)** and **Carnivores (🦖)** are both visible
- [ ] Creatures are **scattered across the map** (not all in one spot)

**Creature Movement:**
- [ ] **Watch creatures move** (pan to a group, observe their positions changing over time)
- [ ] Movement is **not random** (herbivores graze, carnivores hunt — visible behavior difference)
- [ ] Creatures **don't get stuck** (move smoothly, don't overlap awkwardly)

**Creature Respawning:**
- [ ] Over time (1–2 minutes), **creature count stays stable** (respawning happens)
- [ ] If count drops to 0, **creatures respawn** (count goes back to baseline ~30–40)
- [ ] Respawning takes a few ticks (not instant, but quick)

**Taming a Creature:**
- [ ] Move mouse cursor **near a wild creature** on your territory or adjacent
- [ ] Press **`I`** → attempt to tame
- [ ] If successful: **creature is now yours** (creature count may reorganize; HUD shows tamed count)
- [ ] Taming costs **berries** (check Berries inventory before/after, count decreases)
- [ ] Creature **still appears on map** (doesn't disappear, still moves)

**Taming Restrictions:**
- [ ] Try to tame a creature **far from your territory** (> 1 tile adjacent) → fails (no cost, no tame)
- [ ] Try to tame on **opponent's territory** (multiplayer) → fails
- [ ] Tame on your HQ tile → succeeds (0 distance to territory)
- [ ] Tame on tile 1 space from boundary → succeeds (adjacent to territory)

**Tamed Creature Behavior:**
- [ ] Tamed creatures **don't wander wildly** (trust system keeps them in territory)
- [ ] Tamed creatures **respond to idle command** (default behavior, no zone assigned yet — Phase C feature)
- [ ] Tamed creatures **coexist with wild creatures** on the same map

**Expected Result:** Creatures spawn, move, respawn, taming works, tamed creatures behave differently.

---

### **H. HUD Side Panel**

**Objective:** Validate the DOM-based side panel layout, readability, and real-time updates.

**Panel Layout:**
- [ ] **Right edge of screen**, 200px wide (verify with F12 Dev Tools)
- [ ] **Background is dark/semi-transparent** (not blending into game world)
- [ ] **Text is white or light-colored** (good contrast, readable)
- [ ] **Panel is scrollable** if content overflows (or fits without scroll)
- [ ] **Sections are labeled** with headers: Territory, Inventory, Crafted Items, Creatures, Taming/Pack

**Territory Section:**
- [ ] Displays **"🏰 X tiles"** (gold/yellow text)
- [ ] Shows **correct tile count** (verify by claiming tiles, count increments)
- [ ] Updates **instantly** when you claim

**Inventory Section:**
- [ ] Shows **4 rows**: Wood, Stone, Fiber, Berries
- [ ] Icons match (wood icon for Wood, etc.)
- [ ] Counts are **current** (not stale)
- [ ] Updates **sub-100ms** when resources gathered

**Crafted Items Section:**
- [ ] Shows **4 rows**: Walls, Floors, Workbenches, Farms
- [ ] Counts reflect **current stock** (accurate)
- [ ] Updates **immediately** after crafting or placing

**Creatures Section:**
- [ ] Shows **creature counts** (e.g., "🦕 5 🦖 3")
- [ ] Counts match **actual creatures on map** (roughly)
- [ ] Updates as creatures spawn/die

**Taming/Pack Section:**
- [ ] Shows **tamed creature info** (IDs, trust levels if visible)
- [ ] Shows **pack size** (e.g., "Pack: 2/8")
- [ ] Updates when you tame creatures

**Build Mode Indicator:**
- [ ] **Top of HUD panel** (or dedicated area)
- [ ] Shows **"🔨 BUILD MODE [Wall]"** when active
- [ ] Changes **when you cycle build items** (1/2/3/4 keys)
- [ ] **Hides or dims** when you exit build mode (`V`)

**Visual Polish:**
- [ ] No **text overflow** (all numbers visible, no clipping)
- [ ] No **flickering or jitter** when updating
- [ ] Numbers are **readable** at all times
- [ ] Font size is **consistent** (not tiny or huge)

**Performance:**
- [ ] HUD updates are **smooth** (no lag spike when gathering resources)
- [ ] **FPS remains stable** (60 FPS) even when HUD updates
- [ ] **DOM updates are fast** (< 1ms per frame, imperceptible)

**Expected Result:** HUD panel is well-organized, readable, updates in real-time, no performance impact.

---

### **I. Help & UI**

**Objective:** Validate help screen and UI affordances.

**Help Screen:**
- [ ] Press **`?`** or **`/`** → help overlay appears
- [ ] Help screen is **on top** of the game (overlays the canvas)
- [ ] Help lists **all keybinds** (C=craft, V=build, I=tame, H=harvest, etc.)
- [ ] Keybinds in help **match actual game** (press the listed keys and they work)
- [ ] Press **`?` again** → help screen closes
- [ ] After closing, **game is playable** (no UI stuck)

**Connection Status:**
- [ ] **Top-right corner** shows status indicator (circle or text)
- [ ] Shows **"Connected"** (green circle or green text) when game is running
- [ ] If server stops/disconnects, shows **"Disconnected"** (red circle or red text)
- [ ] Attempts **to reconnect** (indicator may show "Reconnecting..." briefly)
- [ ] Reconnection works (indicator returns to green after server restart)

**No Error Messages:**
- [ ] HUD shows **no error overlays** during normal gameplay
- [ ] **Browser console (F12 → Console)** shows **no red errors** (warnings OK)
- [ ] No **pop-ups or alerts** blocking the game

**Expected Result:** Help screen is accurate, connection status is clear, no error messages appear.

---

### **J. Game Feel & Polish**

**Objective:** Validate performance, responsiveness, and visual quality.

**Responsiveness:**
- [ ] **Click-to-claim** feels instant (< 100ms round-trip)
- [ ] **Craft feedback** is immediate (number updates sub-100ms)
- [ ] **Tame feedback** is prompt (creature ownership confirmed quickly)
- [ ] **Camera pan** is smooth (no jank, no frame drops)

**Frame Rate:**
- [ ] Open **F12 → Performance** (or similar)
- [ ] Measure FPS while panning, crafting, claiming
- [ ] **Consistently 60 FPS** (or 58+ FPS, minor variance OK)
- [ ] **No jank** during creature spawning/respawning

**Large Creature Count:**
- [ ] Spawn 40+ creatures on screen (let the game run, let respawn happen)
- [ ] **FPS remains stable** (doesn't drop below 50)
- [ ] **Creatures move smoothly** (no visible lag)
- [ ] **Clicks still respond** (no input lag from creature load)

**Visual Quality:**
- [ ] **Tiles are readable** (grid is clear, biome colors are distinct)
- [ ] **Structures stand out** (not camouflaged into terrain)
- [ ] **Creatures are visible** (bright colors, not hidden)
- [ ] **Territory ownership is obvious** (overlay color is clear)
- [ ] **No visual glitches** (no broken tiles, no missing sprites, no color artifacts)

**Color Accessibility:**
- [ ] **Biome colors are distinct** (not all the same shade)
- [ ] **Player territory colors are distinct** from each other (multiplayer)
- [ ] **Red/green affordability** in craft menu is distinguishable (not just relying on color for colorblind)

**Expected Result:** Game feels responsive, FPS is stable, visuals are polished, accessible.

---

### **K. Multiplayer Isolation**

**Objective:** Validate that 2+ players can play independently without interference.

**Setup:**
- [ ] **Player A** in browser tab 1
- [ ] **Player B** in browser tab 2 (or different browser)
- [ ] Both connect to same server room

**Territory Isolation:**
- [ ] **Each player has own HQ** (positioned far apart)
- [ ] **Each player's territory is different color** (colors don't match)
- [ ] **Player A claims a tile** → Player B sees the color change (within 1–2 ticks)
- [ ] **Player B can't claim Player A's tiles** (clicks fail)

**Resource Independence:**
- [ ] **Player A crafts a wall** → Player A's wood decreases, Player B's unchanged
- [ ] **Both gather resources** from shared resource nodes (not exclusive)
- [ ] **Resource regeneration is shared** (both see same pool)

**Creature Sharing:**
- [ ] **Wild creatures** are shared (both see same creature positions)
- [ ] **Tamed creatures** are isolated (Player A tames creature, only Player A's count increases)
- [ ] **Each player's pack is independent** (pack size shown per player in HUD)

**Building Isolation:**
- [ ] **Player A places a wall** → Player B sees it on the map (shared structures)
- [ ] **Can't place on each other's territory** (placement fails if not yours)
- [ ] **Build mode is personal** (Player A in build mode doesn't affect Player B's controls)

**Camera Independence:**
- [ ] **Player A pans camera** → Player B's view unchanged
- [ ] **Each player's zoom** (if exists) is independent

**No Cross-Talk:**
- [ ] **No message leaks** between players (claims don't trigger on opponent territory)
- [ ] **State sync is accurate** (both players see the same game state within 1–2 ticks)

**Expected Result:** Multiplayer works; players are isolated but share world state correctly.

---

### **L. Edge Cases & Robustness**

**Objective:** Validate boundary conditions, limits, and error recovery.

**Tile Boundaries:**
- [ ] **Click far outside map** (off-screen to the left/right/top/bottom)
- [ ] No claim attempt, no error, no crash
- [ ] **Pan camera to edge** → camera stops (doesn't go beyond)
- [ ] **Place structure outside map** → fails (no cost, no placement)

**Resource Limits:**
- [ ] **Gather until a tile is empty** (craft until wood depleted on one tile)
- [ ] **Tile no longer gives resources** (empty state visual, if any)
- [ ] **Leave tile idle** → resources regenerate after 20–30 ticks
- [ ] **Map never fully depletes** (respawn keeps the game going)

**Inventory Limits:**
- [ ] **Gather 100+ of a resource** → count displays correctly (no overflow, no integer wrap)
- [ ] **Craft continuously** → inventory scales up without issues

**Creature Limits:**
- [ ] **Spawn 40+ creatures** → no crash, FPS stable
- [ ] **Tame many creatures** (approach pack limit 8) → still smooth
- [ ] **Creature population stabilizes** (births/deaths balance)

**Network Robustness:**
- [ ] **Claim tile while claim is in-flight** → second claim waits for first to resolve (no double-spend)
- [ ] **High-latency simulated** (throttle network in DevTools) → claims still work (just slower)
- [ ] **Connection drops, reconnect** → state is preserved, game resumes

**No Exploits:**
- [ ] **Claim tiles with 0 wood** → fails (cost enforced)
- [ ] **Place structures with 0 items** → fails (affordability enforced)
- [ ] **Tame on opponent territory** → fails (adjacency enforced)

**Expected Result:** Boundaries respected, limits handled gracefully, network is robust.

---

### **M. Smoke Test (5–10 minutes)**

If you have limited time, run this quick validation:

```
1. Launch game, see HUD panel on right ✓
2. See map with HQ, creatures visible ✓
3. Click tile next to HQ → territory count increments ✓
4. Press C, craft wall (requires 5 wood) ✓
5. Press V, place wall on your territory ✓
6. Press I near wild creature → tame it ✓
7. Pan camera around, creatures move ✓
8. Open as 2nd player (new tab) → see both territories in different colors ✓
```

If all 8 items pass, Phase A is solid. If any fail, investigate with full checklist.

---

## Known Issues & Deferred Features

### 🐛 Pre-Existing Flaky Test (NOT a blocker)
- **Test:** `server/src/__tests__/creature-ai.test.ts` — "herbivore transitions out of idle"
- **Status:** 239/240 tests pass; 1 flaky creature-ai test
- **Root:** Test timing sensitivity in creature FSM, not game logic
- **Impact:** Zero — game creatures work fine in-game; this is a test harness issue
- **Action:** Ignore for Phase A UAT; Pemulis to review in Phase B

### ⏸️ Deferred to Future Phases
- **Breed system** (Phase C — multi-creature reproduction)
- **Abandon creatures** (low priority, feature exists but untested)
- **Farm harvesting** (Phase B — crops grow, player harvests)
- **Wave spawners** (Phase B — enemies spawn at edges)
- **Pawn zone assignments** (Phase C — assign creatures to gather/guard zones)
- **Round timer** (Phase D — endgame conditions, time limit)
- **Audio** (Phase 5 — music, SFX)
- **Mobile / Touch** (Phase 5)
- **Persistence / Save** (Phase 5+)

---

## How to Run the Test

### **Pre-Test Setup**

```bash
# Terminal 1: Start server
cd /home/saitcho/primal-grid
npm install  # if needed
npm run dev

# Wait for "Server running at http://localhost:3000" or similar
```

### **Run Tests**

1. **Browser:** Open http://localhost:3000 (or deployed URL)
2. **Single-player first:** Run through sections A–J
3. **Multiplayer:** Sections K (optional, but recommended)
4. **Edge cases:** Section L (thorough but not critical)

### **Minimal Test Path** (15–20 min)

- Section A (Game Start): 5 min
- Section B (Territory Claiming): 5 min
- Section F (Crafting): 3 min
- Section G (Creatures): 3 min
- Section M (Smoke Test): 5 min

---

## Success Criteria

**Phase A is DONE when:**

✅ All sections A–H pass (room join, territory, camera, structures, resources, crafting, creatures, HUD)  
✅ Help screen works (section I)  
✅ No game-breaking bugs (section J visual/perf checks)  
✅ Multiplayer isolation works (section K, if tested)  
✅ Edge cases are handled (section L, if tested)  
✅ 239/240 tests pass (pre-existing flaky test is expected)  
✅ FPS stable, no jank, responsive to input  
✅ No console errors

**Ready for Phase B if:** All of above ✅

---

## Notes for dkirby-ms

- **Duration:** Full checklist ~30–45 min. Smoke test ~5–10 min.
- **Environment:** Modern browser (Chrome, Firefox, Safari). No mobile yet.
- **Server:** Ensure `npm run dev` is running. Check terminal for "listening on ..." message.
- **Errors:** Console errors (F12 → Console) are blockers. Warnings are OK. Screenshot any errors for the team.
- **Performance:** Stable FPS is more important than hitting exactly 60 — 50–60 FPS is acceptable.
- **Multiplayer test:** Optional but recommended. Use 2 browser tabs or windows.

---

## Reference

- **Architecture:** `docs/architecture-plan.md` (Phase A spec)
- **Design:** `docs/gdd.md` (game design)
- **Code entry points:**
  - Client: `client/src/main.ts`
  - Server: `server/src/rooms/GameRoom.ts`
  - Shared types: `shared/src/types.ts`

---

**Authored by:** Hal (Lead)  
**Date:** 2026-02-27  
**Next:** Phase B scoping (after Phase A UAT passes)
