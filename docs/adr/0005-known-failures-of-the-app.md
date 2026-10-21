# 0005. Name the app's own failures, never retry or hide them

- **Status:** accepted
- **Date:** 2026-10-19

## Context

A failure may come from the app, not from our code.

## Decision

It fails the test with a message naming the requirement, softly where the journey can go on, with no retries; its message is in `KNOWN` (ADR 0018).

## Consequences

One run names every known defect. The only patch around one is ADR 0013.
