---
name: "discord-webhook-announcements"
description: "Post announcements to the #game-dev Discord channel via webhook"
domain: "communications"
confidence: "low"
source: "earned — first used 2026-03-08 to announce UAT combat build"
---

## Context
When the user asks to post or announce something to Discord, use the webhook URL stored in `.env` at the repo root. The webhook posts to the #game-dev channel. Never hardcode or log the webhook URL — it contains a secret token.

## Patterns

### Reading the webhook URL
```bash
source .env
# The variable is DISCORD_WEBHOOK_URL
```

### Posting a rich embed
```bash
source .env
curl -s -o /dev/null -w "%{http_code}" -X POST "$DISCORD_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
  "embeds": [{
    "title": "...",
    "description": "...",
    "color": 5763719,
    "fields": [
      { "name": "Section", "value": "Content" }
    ],
    "footer": { "text": "..." }
  }]
}'
```
- HTTP 204 = success (no content returned)
- Color `5763719` is green; `15548997` is red; `16776960` is yellow

### Environment URLs
- **UAT:** https://gridtest.kirbytoso.xyz
- **Prod:** https://gridwar.kirbytoso.xyz
- **Dev mode:** append `?dev=1` to disable fog of war and see the full map

## Examples

**Deploy announcement:**
- Title: "🎮 UAT Build Live — {feature summary}"
- Fields: What's New (bullet list), Dev Mode (URL with `?dev=1`)
- Footer: PR reference

**Outage/maintenance:**
- Title: "🔧 Maintenance — {environment}"
- Color: yellow or red

## Anti-Patterns
- ❌ Never hardcode the webhook URL in code, commits, or logs
- ❌ Never store the webhook URL in any file that gets committed to git
- ❌ Never echo or print the URL to stdout
- ❌ Always use `source .env` and reference `$DISCORD_WEBHOOK_URL` by variable name only
