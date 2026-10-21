# 0010. Show the run plan and a live map of the journey before the tests

- **Status:** accepted
- **Date:** 2026-10-19, the live map 2026-10-20

## Context

Nothing in a run said beforehand what it would test, nor how the journey walks through the pages.

## Decision

The `pre · run plan` job writes the run's settings and links `docs/run-plan/map.html`, an [archify](https://github.com/tt-a1i/archify) state diagram of the pages, each arrow a `@step`. It is rendered locally from `journey.archify.json`, committed, and published with the run's reports.

## Consequences

The map changes only when the journey's steps or pages do; then it is re-rendered in the same change:

```bash
node ~/.claude/skills/archify/bin/archify.mjs finalize lifecycle \
  docs/run-plan/journey.archify.json docs/run-plan/map.html \
  --repo-root . --quality showcase --json
```

archify is not on npm, so CI never runs it.
