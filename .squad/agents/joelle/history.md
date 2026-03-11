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
