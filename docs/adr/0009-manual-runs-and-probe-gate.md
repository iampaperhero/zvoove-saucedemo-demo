# 0009. Run on demand, and gate serious changes with a probe and one review

- **Status:** accepted
- **Date:** 2026-10-19, one review round and no pull-request runs 2026-10-21

## Context

Actions minutes are limited, and reviews in several rounds slowed small changes more than they caught.

## Decision

CI runs by hand only, never on a pull request or a schedule; without inputs, Chromium as both users. A serious change (a test, fixture, page object, reporter or CI job) goes to a `probe/<topic>` branch, is run there, and is reviewed once by the critic; it is accepted when every verdict says "no new failure" (ADR 0018). Docs and wording go straight to a PR. A human merges.

## Consequences

Branch protection needs a paid plan, so a hook blocks an agent's push to main and `gh pr merge`.
