# 0006. Seed the random test data

- **Status:** accepted
- **Date:** 2026-10-19, one seed for every test 2026-10-21

## Context

Random test data widens coverage but makes a failure hard to replay.

## Decision

Faker takes the run's seed before every test; the report shows it, and `FAKER_SEED=<seed>` replays the data. On CI it is the run's id.

## Consequences

A failure in our data replays exactly.
