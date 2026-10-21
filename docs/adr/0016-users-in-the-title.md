# 0016. Run every test as each user, the user in the title

- **Status:** accepted
- **Date:** 2026-10-21

## Context

`problem_user` is broken on purpose, `standard_user` is the reference; their runs must be told apart at once.

## Decision

The two users and their shared password come from the environment (`SAUCE_STANDARD_USER`, `SAUCE_PROBLEM_USER`, `SAUCE_PASSWORD`: `.env` locally, repository variables and a secret on CI). The spec runs a `describe(user)` per user of `SAUCE_USERS` (by default both), with the same body and no branch on the user; projects are per browser.

## Consequences

Twice the tests and jobs. The reporters take a test's user from its describe.
