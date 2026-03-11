#!/usr/bin/env bash
# generate-changelog.sh — Produces a categorized, human-readable changelog
# from git commit history. Used by deploy and promotion workflows.
#
# Usage:
#   generate-changelog.sh <range> [--format discord|markdown] [--max-lines N]
#
# Arguments:
#   range        Git revision range (e.g. HEAD~10..HEAD, origin/uat..origin/dev)
#   --format     Output format: "discord" (bullet list, compact) or "markdown" (sections with headers)
#                Default: discord
#   --max-lines  Maximum total lines to include. Default: 10 (discord) / 30 (markdown)
#
# Output:
#   Writes the changelog to stdout. Caller captures it.
#
# Categorization rules:
#   🎮 Features & Gameplay   — feat:, feature:
#   🐛 Bug Fixes             — fix:, bugfix:, hotfix:
#   ⚡ Improvements           — perf:, refactor:, style:, improve:
#   📝 Documentation          — docs:
#   🧪 Tests                  — test:, tests:
#   🔧 Maintenance            — build:, ci:, chore:, squad:, squad(...)
#
# Commits in the Maintenance category are excluded from Discord output.
# Squad-internal commits (squad:, squad(...):) are always excluded.

set -euo pipefail

RANGE="${1:?Usage: generate-changelog.sh <range> [--format discord|markdown] [--max-lines N]}"
shift

FORMAT="discord"
MAX_LINES=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --format) FORMAT="$2"; shift 2 ;;
    --max-lines) MAX_LINES="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Set default max-lines based on format
if [ -z "$MAX_LINES" ]; then
  if [ "$FORMAT" = "discord" ]; then
    MAX_LINES=10
  else
    MAX_LINES=30
  fi
fi

# Collect raw commits: short hash + subject
RAW=$(git log --no-merges --pretty=format:'%h|%s' "$RANGE" 2>/dev/null | head -50 || true)

if [ -z "$RAW" ]; then
  echo "• No recent changes"
  exit 0
fi

# Classification buckets
FEATURES=""
FIXES=""
IMPROVEMENTS=""
DOCS=""
TESTS=""
MAINTENANCE=""
OTHER=""

classify_commit() {
  local hash="$1"
  local subject="$2"

  # Always exclude squad-internal commits
  if echo "$subject" | grep -qiE '^squad[:(]'; then
    return
  fi

  # Extract conventional commit type and description
  local type=""
  local desc=""

  if echo "$subject" | grep -qE '^[a-z]+(\(.+\))?!?:'; then
    type=$(echo "$subject" | sed -E 's/^([a-z]+)(\(.+\))?!?:.*/\1/')
    desc=$(echo "$subject" | sed -E 's/^[a-z]+(\(.+\))?!?:[[:space:]]*//')
  else
    desc="$subject"
  fi

  # Capitalize first letter of description
  desc="$(echo "${desc:0:1}" | tr '[:lower:]' '[:upper:]')${desc:1}"

  local line="• ${desc}"

  case "$type" in
    feat|feature)
      FEATURES="${FEATURES}${line}"$'\n' ;;
    fix|bugfix|hotfix)
      FIXES="${FIXES}${line}"$'\n' ;;
    perf|refactor|style|improve)
      IMPROVEMENTS="${IMPROVEMENTS}${line}"$'\n' ;;
    docs)
      DOCS="${DOCS}${line}"$'\n' ;;
    test|tests)
      TESTS="${TESTS}${line}"$'\n' ;;
    build|ci|chore)
      MAINTENANCE="${MAINTENANCE}${line}"$'\n' ;;
    *)
      # No recognized prefix — try keyword matching on the original subject
      if echo "$subject" | grep -qiE '(add|new|feature|implement|introduce|create|enable)'; then
        FEATURES="${FEATURES}${line}"$'\n'
      elif echo "$subject" | grep -qiE '(fix|bug|patch|resolve|repair|correct)'; then
        FIXES="${FIXES}${line}"$'\n'
      elif echo "$subject" | grep -qiE '(update|improve|refactor|optimize|clean|enhance)'; then
        IMPROVEMENTS="${IMPROVEMENTS}${line}"$'\n'
      else
        OTHER="${OTHER}${line}"$'\n'
      fi
      ;;
  esac
}

while IFS='|' read -r hash subject; do
  [ -z "$hash" ] && continue
  classify_commit "$hash" "$subject"
done <<< "$RAW"

# Build output based on format
OUTPUT=""
line_count=0

append_section() {
  local header="$1"
  local content="$2"

  [ -z "$content" ] && return

  # Count lines in this section
  local section_lines
  section_lines=$(echo -n "$content" | grep -c '^' || true)

  # Don't exceed max lines
  local remaining=$((MAX_LINES - line_count))
  [ "$remaining" -le 0 ] && return

  if [ "$section_lines" -gt "$remaining" ]; then
    content=$(echo "$content" | head -n "$remaining")
  fi

  if [ "$FORMAT" = "markdown" ]; then
    OUTPUT="${OUTPUT}${header}"$'\n'"${content}"$'\n'
  else
    # Discord: use bold header inline
    OUTPUT="${OUTPUT}**${header}**"$'\n'"${content}"
  fi

  line_count=$((line_count + $(echo -n "$content" | grep -c '^' || true)))
}

# Priority order: Features → Fixes → Improvements → Other → Docs → Tests → Maintenance
append_section "🎮 Features & Gameplay" "$FEATURES"
append_section "🐛 Bug Fixes" "$FIXES"
append_section "⚡ Improvements" "$IMPROVEMENTS"
append_section "📦 Other" "$OTHER"

if [ "$FORMAT" = "markdown" ]; then
  # Include lower-priority sections only in markdown (PR bodies)
  append_section "📝 Documentation" "$DOCS"
  append_section "🧪 Tests" "$TESTS"
  append_section "🔧 Maintenance" "$MAINTENANCE"
fi

# Trim trailing whitespace
OUTPUT=$(echo "$OUTPUT" | sed -e 's/[[:space:]]*$//')

if [ -z "$OUTPUT" ]; then
  echo "• No player-facing changes"
else
  echo "$OUTPUT"
fi
