# 0018. Fail the job on any failed test, and tell known failures from new ones

- **Status:** accepted
- **Date:** 2026-10-21

## Context

`problem_user` fails on every run with its known defects, so a new failure looks the same.

## Decision

A failed test fails its job: an open bug is a gate. `KNOWN` in `fixtures/issues.ts` holds each user's open issues with their exact messages; the verdict reporter compares every failure with them and the job's last step says "no new failure" or names the new one.

## Consequences

`problem_user`'s job stays red until #1, #2 and #3 are fixed. Changing an expect's message, or a new known issue, updates `KNOWN` in the same change.
