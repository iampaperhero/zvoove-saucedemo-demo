# 0004. Stay on the latest Playwright and pin it

- **Status:** accepted
- **Date:** 2026-10-19

## Context

The browsers ship with Playwright, so its version decides what is tested. From 1.59 WebKit does not start on macOS 14.

## Decision

`package.json` pins the latest Playwright exactly, and the image in the Dockerfile and in the workflow's test job carries the same version. WebKit is skipped with a reason on macOS 14.

## Consequences

An upgrade changes the version in those three places together.
