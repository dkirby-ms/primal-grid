## Squad-Triage Keyword Routing Must Match Team Roles

**Author:** Marathe (DevOps / CI-CD)
**Date:** 2026-03-10

**Decision:** The keyword routing in `squad-triage.yml` now supports game-specific role categories alongside the original web-app categories. Domain-specific matchers (game, systems/simulation) are evaluated before their generic counterparts (frontend, backend) so game teams get accurate routing while standard web-app teams still work via fallback matchers.

**Rationale:** Roles like "Game Dev" and "Systems Dev" don't contain "frontend" or "backend", causing 100% misrouting to the Lead. The fix adds two new matcher blocks with game-domain keywords, ordered before the generic blocks.

**Impact:** Any future team role additions that don't align with the existing keyword categories (frontend, backend, test, devops, game, systems) will need a new matcher block added to `squad-triage.yml`.
