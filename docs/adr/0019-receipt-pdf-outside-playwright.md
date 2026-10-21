# 0019. Leave the order receipt PDF to the LLM judge, outside Playwright

- **Status:** accepted
- **Date:** 2026-10-21, supersedes 0017

## Context

Parsing the receipt PDF was code the suite owned for one file, and its failures were the hardest to read.

## Decision

The journey stops at the confirmation and its "Generate PDF order" button (R-DONE-7); the LLM judge (Jev) reads the receipt separately.

## Consequences

`standard_user`'s journey passes. R-DONE-9 (#13) is covered only by the LLM judge, which gets the receipt from a fixture after the test (ADR 0020).
