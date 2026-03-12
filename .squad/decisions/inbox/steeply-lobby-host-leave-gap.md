## Lobby Host-Leave Gap (Observed in Testing)

**Author:** Steeply
**Date:** 2026-03-15
**Status:** Observation — No Code Change

When the host leaves a waiting game that still has other players, the game persists in "waiting" status but nobody can start it (only the original host can call START_GAME). The remaining players are stranded — they can leave, but cannot start.

Options for Pemulis/Hal to consider:
1. Transfer host role to next player
2. Cancel the game and notify remaining players
3. Leave as-is (players can leave and re-create)

No tests were blocked by this — just flagging the behavioral gap.
