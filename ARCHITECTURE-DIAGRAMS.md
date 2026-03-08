# Primal Grid Client Architecture — Visual Diagrams

## 1. CONNECTION FLOW

```
Player opens browser
        ↓
http://localhost:3000
        ↓
Vite dev server (port 3000)
        ↓
main.ts bootstrap()
        ↓
PixiJS Application init
        ↓
Call connect() [network.ts]
        ↓
Create Colyseus Client
        ↓
WebSocket connection
        ↓
ws://localhost:2567
        ↓
        ┌─────────────────────────┐
        │   Game Server          │
        │ (Colyseus Room: game)  │
        └─────────────────────────┘
        ↓
client.joinOrCreate('game', options)
        ├─→ if (?dev=1) → devMode: true
        ├─→ if (?devmode=1) → devMode: true
        ↓
room.sessionId = unique ID
        ↓
promptForName()  [show modal]
        ↓
room.send(SET_NAME, { name })
        ↓
Bind all renderers to room.onStateChange()
        ↓
Game starts!
```

## 2. CLIENT ARCHITECTURE LAYERS

```
┌──────────────────────────────────────────────────────────────┐
│                  BROWSER DOM                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              client/index.html                       │   │
│  │  ┌────────────────┬──────────────────────────────┐  │   │
│  │  │                │                              │  │   │
│  │  │ #app canvas    │     #hud-panel               │  │   │
│  │  │ (600×600)      │     (200×600)                │  │   │
│  │  │                │  ┌─ Day/Phase               │  │   │
│  │  │ PixiJS Stage   │  ├─ Level/XP               │  │   │
│  │  │                │  ├─ Territory              │  │   │
│  │  │                │  ├─ Inventory              │  │   │
│  │  │                │  ├─ Creatures              │  │   │
│  │  │                │  └─ Spawn Buttons          │  │   │
│  │  └────────────────┴──────────────────────────────┘  │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │        #game-log (800×120)                   │  │   │
│  │  │  Message log panel                           │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Modals (overlays)                                   │   │
│  │  ├─ #name-prompt-overlay (join modal)               │   │
│  │  ├─ #scoreboard-overlay (Tab key)                   │   │
│  │  └─ HelpScreen (? key)                              │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
         ↑
  Input Handler (keyboard/mouse)
   - Arrow keys → Camera pan
   - Mouse wheel → Camera zoom
   - Click buttons → Spawn creatures
   - Tab → Scoreboard toggle
   - ? → Help toggle

         ↑
  PixiJS Rendering Pipeline
  (app.ticker loop @ 60fps)
   ├─ Camera.update()
   ├─ GridRenderer.tick()
   │  ├─ Render tiles
   │  ├─ Render territory overlays
   │  ├─ Render HQ markers
   │  └─ Render fog of war
   ├─ CreatureRenderer.tick()
   │  ├─ Update creature positions
   │  ├─ Animate movement
   │  ├─ Render health bars
   │  └─ Render state indicators
   └─ CombatEffects visual updates

         ↑
  Room State → Renderers
  room.onStateChange() bindings
   ├─ GridRenderer.bindToRoom()
   ├─ CreatureRenderer.bindToRoom()
   ├─ HudDOM.bindToRoom()
   └─ Scoreboard.bindToRoom()

         ↑
  Colyseus WebSocket Connection
  ws://localhost:2567
   ├─ room.state.players (MapSchema)
   ├─ room.state.pawns (MapSchema)
   ├─ room.state.structures (MapSchema)
   ├─ room.state.dayPhase (string)
   ├─ room.state.map (tile data)
   └─ Event listeners:
      ├─ onStateChange()
      ├─ onMessage('game_log')
      ├─ onLeave()
      └─ onError()
```

## 3. RENDERING PIPELINE

```
PixiJS Application (600×600 canvas)
│
└─ Stage
   │
   ├─ GridRenderer.container  (z-order: 0)
   │  │
   │  ├─ Tile Graphics[] (base layer)
   │  │  ├─ Grassland: 0x4a7c4f
   │  │  ├─ Forest: 0x2d5a27
   │  │  ├─ Water: 0x5da5d5 / 0x2e6b9e
   │  │  ├─ Desert: 0xd2b48c
   │  │  └─ ... (other tile types)
   │  │
   │  ├─ Territory Overlays (semi-transparent player colors)
   │  │  └─ One color per player overlaid on tiles
   │  │
   │  ├─ HQ Markers (Text + emoji)
   │  │  ├─ 🏰 emoji
   │  │  ├─ Player display name
   │  │  └─ Positioned at (hqX * 32, hqY * 32)
   │  │
   │  ├─ Fog of War (dark overlay on unexplored tiles)
   │  │  ├─ Disabled if ?dev=1
   │  │  └─ Updates as player explores
   │  │
   │  ├─ CreatureRenderer.container (z-order: 1)
   │  │  │
   │  │  ├─ Creature Graphics (circles)
   │  │  │  ├─ Herbivore: 0x4caf50 (green)
   │  │  │  ├─ Carnivore: 0xf44336 (red)
   │  │  │  ├─ Builder: 0x42a5f5 (blue)
   │  │  │  ├─ Defender: 0x2196f3 (navy)
   │  │  │  └─ Attacker: 0xff9800 (orange)
   │  │  │
   │  │  ├─ Emoji Text labels
   │  │  │
   │  │  ├─ Health Bars (Graphics)
   │  │  │  └─ Green/red fill based on health %
   │  │  │
   │  │  ├─ Progress Bars (for builders)
   │  │  │  └─ Build progress %
   │  │  │
   │  │  └─ State Indicators (Text)
   │  │     └─ IDLE, EAT, HUNT, BUILDING, etc.
   │  │
   │  └─ CombatEffects.container (z-order: 2)
   │     └─ Combat visual effects
   │        ├─ Damage indicators
   │        └─ Hit effects
   │
   └─ ConnectionStatusUI.container (screen-fixed overlay)
      └─ Connection status indicator
         └─ "connecting" / "connected" / "disconnected"

Camera (applied to GridRenderer.container)
   ├─ Position (x, y offset)
   ├─ Scale (0.5–3.0, zoomed to cursor)
   ├─ Bounds (follows explored area)
   └─ Smooth lerp (0.08 speed)
```

## 4. STATE SYNCHRONIZATION

```
Server (room.state)
│
├─ players: MapSchema<Player>
│  └─ {
│      id: "session-id-123",
│      displayName: "Alice",
│      color: "#ff5500",
│      hqX: 25, hqY: 25,
│      level: 3,
│      xp: 150,
│      wood: 100,
│      stone: 50,
│      ... other stats
│    }
│
├─ pawns: MapSchema<Pawn>
│  └─ {
│      id: "pawn-456",
│      type: "builder",
│      state: "building",
│      x: 26, y: 25,
│      owner: "session-id-123",
│      health: 50,
│      buildProgress: 0.75,
│      ... combat stats
│    }
│
├─ structures: MapSchema<Structure>
│  └─ { id, type, x, y, owner, hp }
│
├─ map: 2D tile array
│  └─ [tileType, tileType, ...]
│
└─ dayPhase: "day" | "night"

         ↓ WEBSOCKET UPDATES ↓
         
Client-side room.state
   │
   └─ room.onStateChange.subscribe()
      │
      ├─ GridRenderer.bindToRoom()
      │  └─ Updates tiles, overlays, HQs, fog
      │
      ├─ CreatureRenderer.bindToRoom()
      │  └─ Updates creatures, health, states
      │
      ├─ HudDOM.bindToRoom()
      │  └─ Updates inventory, level, resources
      │
      └─ Scoreboard.bindToRoom()
         └─ Updates leaderboard display
```

## 5. MULTIPLAYER FLOW

```
Browser 1 (Alice)
│
└─ WebSocket: ws://localhost:2567
   └─ room.sessionId = "abc123"
   └─ room.state.players["abc123"] = Alice's player

         ↑ ↓ BROADCAST ↑ ↓

    Game Server
    (Colyseus Room: "game")
    
    State changes:
    - Alice moves a creature → broadcast to all
    - Bob spawns a unit → Alice sees it
    - Map state changes → both players sync

         ↑ ↓ BROADCAST ↑ ↓

Browser 2 (Bob)
│
└─ WebSocket: ws://localhost:2567
   └─ room.sessionId = "def456"
   └─ room.state.players["def456"] = Bob's player
   └─ room.state.players["abc123"] = Alice's player (synced)

Result:
   - Alice and Bob see each other's HQs
   - Both see creatures on shared map
   - Territory colors show both players' areas
   - Combat between creatures is visible to both
```

## 6. NAME PROMPT & JOIN FLOW

```
Client loads
   ↓
bootstrap() → connect()
   ↓
room = await client.joinOrCreate('game')
   ↓
promptForName() modal appears
   ├─ #name-prompt-overlay.classList.add('visible')
   ├─ Focus #name-prompt-input
   └─ Wait for click or Enter key
   ↓
User types name → clicks "Join Game"
   ↓
name = input.value || 'Explorer'
   ↓
room.send(SET_NAME, { name: "Alice" })
   ↓
Server receives, updates room.state.players[sessionId].displayName
   ↓
room.onStateChange.once() → HQ position received
   ↓
Camera.centerOnHQ(localPlayer.hqX, localPlayer.hqY)
   ↓
Game playable!
```

## 7. CAMERA CONTROL

```
User Input                    Camera State
   │                              │
   ├─ Arrow/WASD key down        ├─ keys.w/a/s/d = true
   ├─ Mouse wheel up              ├─ Scale += zoom_step
   ├─ Mouse drag                  ├─ Position += (dragX, dragY)
   ├─ Spacebar                    └─ Lerp to HQ position
   └─ Key release                 └─ keys.w/a/s/d = false
   │                              │
   └─→ InputHandler               └─→ Camera.update() [frame tick]
       │                              │
       └─ window.addEventListener     ├─ Apply pan from key states
          keydown/keyup/wheel/mouse   ├─ Apply zoom limits (0.5–3.0)
                                      ├─ Clamp to map bounds
                                      └─ Smooth lerp explored bounds
                                      │
                                      ↓
                                      GridRenderer.container.position = camera.pos
                                      GridRenderer.container.scale = camera.scale
                                      │
                                      ↓
                                      Visual pan/zoom on next render
```

## 8. DEV MODE DETECTION

```
URL with ?dev=1 or ?devmode=1
         ↓
Browser loads http://localhost:3000?dev=1
         ↓
main.ts calls network.connect()
         ↓
getServerUrl() → ws://localhost:2567
         ↓
isDevMode() checks URLSearchParams
         ├─ params.get('dev') === '1' ? true
         ├─ params.get('devmode') === '1' ? true
         └─ else false
         ↓
if (isDevMode()):
   joinOptions.devMode = true
   console.log('[network] Dev mode enabled — fog of war disabled')
         ↓
client.joinOrCreate('game', joinOptions)
         ↓
Server receives devMode: true
         ├─ Disables fog of war
         └─ May enable other debug features
         ↓
GridRenderer renders full map (no fog overlay)
```

---

## QUICK TEST SCENARIOS

### Scenario 1: Single Player Test
```
1. npm run dev  (starts :3000 client + :2567 server)
2. Open browser http://localhost:3000?dev=1
3. Enter name → Game loads
4. Verify:
   - Canvas renders (600×600)
   - HUD panel shows (inventory, buttons)
   - Map visible (no fog due to ?dev=1)
   - HQ marker visible
   - Camera controls work (WASD, mouse wheel)
   - Buttons clickable
```

### Scenario 2: Multiplayer Test
```
1. npm run dev
2. Tab 1: http://localhost:3000?dev=1 → name "Alice"
3. Tab 2: http://localhost:3000?dev=1 → name "Bob"
4. Verify:
   - Both see Alice's HQ + Bob's HQ
   - Both see each other's creatures
   - Territory colors show both players
   - Scoreboard (Tab key) shows both players
   - One player's action → other sees it
```

### Scenario 3: Camera Zoom Test
```
1. Open game
2. Scroll mouse wheel up
3. Verify:
   - Zoom increases (scale > 1.0)
   - Zoom anchored to mouse cursor
   - Camera doesn't jump erratically
4. Scroll wheel down
5. Verify:
   - Zoom decreases (scale < 1.0)
   - Still anchored to cursor
```

---

## KEYBOARD & MOUSE MAP

```
KEY/INPUT          ACTION                  HANDLER
─────────────────────────────────────────────────────
Arrow Up           Pan up                  Camera
Arrow Down         Pan down                Camera
Arrow Left         Pan left                Camera
Arrow Right        Pan right               Camera
W                  Pan up                  Camera
A                  Pan left                Camera
S                  Pan down                Camera
D                  Pan right               Camera
Mouse Wheel Up     Zoom in                 Camera
Mouse Wheel Down   Zoom out                Camera
Middle/Right Drag  Pan map                 Camera
Spacebar           Center on HQ            InputHandler
Tab                Toggle Scoreboard       InputHandler
?  or  /           Toggle Help             InputHandler

BUTTON CLICK:
─────────────────────────────────────────────────────
#spawn-builder-btn     Spawn builder      HudDOM
#spawn-defender-btn    Spawn defender     HudDOM
#spawn-attacker-btn    Spawn attacker     HudDOM
#name-prompt-submit    Submit name        main.ts

MODAL:
─────────────────────────────────────────────────────
#name-prompt-input     Enter player name
Tab (scoreboard modal)  Close via Tab key
? (help modal)         Close via ? key again
```

