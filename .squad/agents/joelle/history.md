# Joelle — History

## Project Context

- **Project:** Primal Grid — grid-based survival colony builder with dinosaurs, ecosystem simulation, and base automation in the browser
- **Stack:** TypeScript, HTML5 Canvas, Colyseus (multiplayer), browser-based web game
- **Owner:** dkirby-ms
- **Joined:** 2026-03-10

## Core Context

- Discord notifications are sent from deploy workflows (`deploy-uat.yml`, `deploy.yml`) via webhook, posted as "Squad: Marathe"
- Changelogs in Discord sort features/bugfixes first, chores after, and exclude merge commits (decision from 2026-03-10)
- README.md is the primary entry point for new players and contributors
- Branch flow: feature/* → dev → uat → prod
- Design document lives at `docs/design-sketch.md`

## Learnings

### 2026-03-10: Dev Journal — Discord Identity Handoff
- dkirby-ms confirmed Joelle should be the Discord announcement voice, not Marathe
- Deploy workflows (`deploy-uat.yml`, `deploy.yml`) currently hardcode "Squad: Marathe" as webhook username
- Hal is investigating the fix — Joelle's charter already lists Discord notifications as her responsibility

### 2026-03-14: Issue #155 — Updated Player-Facing Documentation
- **Files updated:** README.md, HOW-TO-PLAY.md, client/src/ui/HelpScreen.ts
- **Key changes:**
  - Food added as third resource with unit upkeep mechanic (1-3 food/tick per pawn type)
  - Starting resources now 25 Wood, 15 Stone, 50 Food
  - Farm income changed from +1W+1S to +2 Food exclusively
  - Factory income remains +2W+1S
  - Buildings now provide spawn cap bonuses: +1 cap per Farm, +2 per Factory
  - Pawn spawn costs reduced (wood/stone) to reflect food upkeep:
    - Builder: 10W5S → 8W4S
    - Defender: 15W10S → 12W8S
    - Raider: 20W15S → 16W12S
    - Explorer: 12W8S → 10W6S
  - Added starvation mechanic: when food ≤ 0, random pawn takes 5 damage per income tick
  - Enemy base rewards now include food rewards
  - In-game help screen updated with current values using HelpScreen.ts constants
  - HOW-TO-PLAY now has dedicated Food Economy section with starvation callout
- **PR:** #158 targeting dev branch
- **Style notes:** Kept existing guide structure, wrote for players not developers, emphasized food-unit-balance tension
