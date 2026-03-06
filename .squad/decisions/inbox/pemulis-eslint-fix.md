# Decision: Merge duplicate ESLint `rules` blocks

**Author:** Pemulis (Systems Dev)
**Date:** 2025-07-15
**Requested by:** dkirby-ms

## Problem

`.eslintrc.cjs` had two `rules:` properties in the same object literal. In JavaScript, duplicate keys silently resolve to the last one — so the second block (`security/detect-object-injection: 'off'`) was overwriting the first block (the `@typescript-eslint/no-unused-vars` config with underscore ignore patterns). This caused 19 false-positive unused-variable lint errors across the codebase.

## Fix

Merged both `rules` entries into a single property containing both rules. No other changes needed — lint now passes clean with zero errors.
