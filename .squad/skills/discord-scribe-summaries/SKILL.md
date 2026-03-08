---
name: "discord-scribe-summaries"
description: "Post work summaries to Discord after substantial session logging"
domain: "communications"
confidence: "medium"
source: "defined 2026 — auto-posting from Scribe after session logging and decision merges"
---

## Context
After Scribe completes session logging and decision merges, post a brief summary to the #game-dev Discord channel using the discord-webhook-announcements skill. This gives the team visibility into what happened during a session without requiring manual announcements.

## When to Post
Post summaries only when work was **substantial**. Criteria for "substantial":
- 2 or more agents ran during the session, **OR**
- At least one decision was made and merged, **OR**
- One or more issues were resolved/closed

Skip posting for trivial single-agent logging (e.g., a single agent did brief work with no decisions).

## Embed Format

Use a Discord rich embed with this structure:

```json
{
  "username": "Squad: Scribe",
  "embeds": [{
    "title": "📋 Session Summary",
    "description": "{brief overview of session outcomes}",
    "color": 5763719,
    "fields": [
      { "name": "Agents", "value": "{comma-separated list of agents who worked}" },
      { "name": "Work Done", "value": "{2-3 line summary of accomplishments}" },
      { "name": "Decisions", "value": "{list of decisions made, or 'None' if none}" }
    ],
    "footer": { "text": "Session logged to .squad/log/" }
  }]
}
```

## Color Coding

- **Green (`5763719`)**: Normal session with solid progress and no blockers
- **Yellow (`16776960`)**: Session had blockers, rejections, or issues that need follow-up

Choose the color based on the session's outcome:
- If the session produced rejections or had unresolved blockers → yellow
- Otherwise → green

## Username Convention

Always use `"username": "Squad: Scribe"` so Discord shows the post as coming from the Scribe agent, maintaining clear attribution to the team's memory/logging role.

## Implementation Notes

- Use the discord-webhook-announcements skill for the curl pattern and `.env` sourcing
- Never hardcode the webhook URL
- Read `.squad/log/` entries and `.squad/decisions.md` to determine what to include
- Keep descriptions brief (1-2 sentences) — Discord embeds have display limits
- Only post after a successful git commit of `.squad/` changes

## Examples

**Good summary (substantial multi-agent work):**
```
Title: 📋 Session Summary
Description: Copilot and Steeply collaborated on authentication flow. Merged 3 cross-agent decisions.
Agents: Copilot, Steeply
Work Done: Implemented JWT refresh logic, updated token validation. Merged decision on error handling strategy.
Decisions: Always retry failed auth with backoff, Treat expired tokens as 401
Color: Green
```

**Don't post (trivial logging):**
```
Session was just Scribe logging a single agent's work with no decisions made.
→ Skip the Discord post.
```
