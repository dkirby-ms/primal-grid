# Decision: Production Changelog — Merge-Based Range Calculation

**Date:** 2026-03-08  
**Author:** Marathe  
**Status:** Implemented  
**PR:** #187

## Context

The production deployment workflow (`deploy.yml`) was generating empty changelogs when multiple dev→UAT promotions preceded a single UAT→prod promotion. The issue stemmed from using `git describe --tags` to find the baseline for changelog generation, which:

1. Is unreliable with shallow clones (`--depth 50`)
2. Doesn't align with our promotion model (no git tags created on intermediate promotions)
3. Advances the comparison baseline with each intermediate promotion, causing data loss

## Decision

**Changed production changelog generation to use merge commit first-parent detection.**

Instead of relying on git tags, the workflow now:

1. Detects if the current prod commit is a merge commit (>2 parents)
2. If yes: compares first parent (previous prod state) against HEAD
3. If no: falls back to last 10 commits (for workflow_dispatch scenarios)

## Rationale

### Why First-Parent Detection?

When UAT→prod promotions are merged via GitHub PR, the merge commit structure is:
- **First parent:** Previous prod HEAD (before merge)
- **Second parent:** UAT branch that was merged

By using `{first_parent}..HEAD`, we capture **all** commits from UAT in a single range, regardless of how many intermediate dev→UAT promotions occurred. This aligns with our promotion model and ensures no changelog content is lost.

### Why Not Tags?

Our current workflow doesn't create git tags at intermediate promotion steps:
- `squad-promote.yml` bumps `package.json` version with `npm version patch --no-git-tag-version` (note the flag)
- Only final prod releases might receive tags (not standardized)
- Tags are not a reliable source of truth for promotion history

### Why Not `origin/prod..origin/uat`?

This would work at promotion time (and does work in `squad-promote.yml`), but `deploy.yml` runs **after** the merge to prod. At that point, `origin/uat` and `origin/prod` point to the same commit (or very close), making the comparison useless.

## Implementation

```bash
MERGE_COMMIT=$(git rev-parse origin/prod)
PARENT_COUNT=$(git rev-list --parents -n 1 $MERGE_COMMIT | wc -w)

if [ "$PARENT_COUNT" -gt 2 ]; then
  # This is a merge commit — use first parent as baseline
  PREVIOUS_PROD=$(git rev-parse ${MERGE_COMMIT}^1)
  RANGE="${PREVIOUS_PROD}..${MERGE_COMMIT}"
else
  # Not a merge commit (workflow_dispatch?) — compare last 10 commits
  RANGE="origin/prod~10..origin/prod"
fi
```

## Alternatives Considered

1. **Tag after each prod deploy** — Considered but rejected. Adds complexity and doesn't fix the root issue (shallow clone depth limits).
2. **Increase clone depth to 200** — Mitigates but doesn't solve. Still fails if >200 commits accumulate between promotions.
3. **Extract changelog from merged PR body** — Interesting but fragile. PR bodies can be edited post-merge, and parsing PR descriptions adds brittleness.

## Impact

- ✅ Fixes #186 — Prod changelogs now include all changes since last prod release
- ✅ Works reliably with shallow clones (no tag dependency)
- ✅ Aligns with existing promotion model (no workflow changes needed)
- ✅ Maintains fallback behavior for non-merge scenarios (workflow_dispatch)

## Related Files

- `.github/workflows/deploy.yml` — Discord notification step (lines 103-118)
- `.github/workflows/squad-promote.yml` — UAT→prod promotion (correctly uses `origin/prod..origin/uat`)
- `.github/scripts/generate-changelog.sh` — Shared changelog generator (unchanged)

## Future Considerations

If we move to a tag-based release strategy in the future:
- Consider creating git tags at UAT promotion time (not just prod)
- Or use GitHub Releases API to track deploy history
- Current merge-based approach will continue to work regardless
