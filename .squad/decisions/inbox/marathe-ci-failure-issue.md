# CI Failure Auto-Issue Workflow

**Author:** Marathe  
**Date:** 2026-03-12  
**Issue:** #174  
**PR:** #175  
**Status:** Implemented  

## Decision

Implemented automated GitHub issue creation for CI workflow failures using the workflow_run event pattern.

## Rationale

Problem: CI failures were going unnoticed, requiring manual monitoring of Actions tab. No systematic tracking of recurring failures.

Solution: Workflow that monitors CI pipeline completions and automatically files issues with detailed failure context.

## Implementation Details

Trigger Pattern:
- on workflow_run for Squad CI and E2E Tests
- types: completed, filtered for conclusion == failure

Duplicate Prevention:
- Search existing open issues by workflow name + branch in title
- Filter by labels: ci-failure, automated
- If found: add comment with new failure details
- If not found: create new issue

Issue Content:
- Workflow name and run ID
- Branch and commit SHA with links
- Failed job names and timestamps
- Direct links to workflow run and commit
- Labels: ci-failure, automated

Permissions:
- contents: read for checkout
- issues: write for issue creation/commenting

## Trade-offs

Pros:
- Zero-cost solution using GitHub native features
- Searchable, linkable failure history
- Team can triage and assign in existing workflow
- Duplicate detection prevents noise

Cons:
- Requires team to close resolved issues (not automatic)
- No advanced analytics or trends
- Labels must exist in repo

## Monitoring Workflows

Currently monitors:
- Squad CI (runs on PR to dev/uat/prod)
- E2E Tests (manual workflow_dispatch)

To add more workflows, update the workflows array in .github/workflows/ci-failure-issue.yml

— Marathe
