# Discord Webhook Identity Handoff: Marathe → Joelle

**Author:** Hal (Lead)  
**Date:** 2026-03-10  
**Status:** Recommendation  

## Context

Joelle joined the team as Community/DevRel specialist (`.squad/agents/joelle/charter.md`) and owns Discord deployment notifications — tone, formatting, and community voice. However, three GitHub Actions workflows still hardcode `"username": "Squad: Marathe"` in Discord webhook payloads:

1. `.github/workflows/deploy.yml` (line 169) — production deployments
2. `.github/workflows/deploy-uat.yml` (line 169) — UAT deployments
3. `.github/workflows/e2e.yml` (line 95) — E2E test results

This means Joelle's first community announcement shipped as Marathe instead of her own identity — the onboarding issue dkirby-ms noted.

## Root Cause

When Joelle was added, the deploy workflows were not updated to reflect the ownership transfer. The changelog mechanics (commit fetching, sorting, filtering) remain Marathe's domain as CI/CD infrastructure, but the **Discord identity** is Joelle's.

## Decision

### Change webhook username from "Squad: Marathe" to "Squad: Joelle" in:
- `deploy.yml` line 169
- `deploy-uat.yml` line 169
- `e2e.yml` line 95

### Ownership split:
- **Joelle owns:** Discord identity, message tone, changelog formatting/curation, what goes in the message
- **Marathe owns:** CI/CD mechanics (workflow structure, changelog generation scripts, build/deploy logic)

### Rationale
1. **Charter alignment:** Joelle's charter explicitly lists "Discord deployment notifications" as owned by her
2. **Community voice:** Deployment announcements are player-facing communications — Joelle's domain
3. **Clear boundary:** The infrastructure (workflow YAML, bash scripts) stays with Marathe; the community identity and voice belongs to Joelle
4. **Consistency:** All deployment/test notifications should come from the same community voice

## Future Pattern

If new Discord notifications are added:
- Workflow mechanics → Marathe (or relevant CI/CD owner)
- Discord identity/message content → Joelle
- Joelle may request changes to Marathe's changelog scripts if the format doesn't serve community needs

## Implementation

Update all three workflows:
```yaml
"username": "Squad: Joelle",
```

No other changes needed — the changelog generation logic, embed structure, and webhook mechanics remain Marathe's work.

## Related Files
- `.squad/agents/joelle/charter.md` — Joelle's ownership of Discord notifications
- `.squad/agents/marathe/charter.md` — Marathe's CI/CD infrastructure domain
- `.github/workflows/deploy.yml`
- `.github/workflows/deploy-uat.yml`
- `.github/workflows/e2e.yml`
