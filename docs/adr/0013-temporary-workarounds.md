# 0013. Patch the app around an open issue only after the test has recorded the defect

- **Status:** accepted
- **Date:** 2026-10-20

## Context

As `problem_user`, Last Name loses what was typed (#1), so checkout never reaches the defects behind it (#2, #3).

## Decision

The spec records #1 first, softly. Then the `lastNameWorkaround` fixture checks that the form refuses Continue, removes the defect's branch from the app's bundle with `page.route`, reloads and types again; a guard stops the test if the patch no longer matches or did not work.

## Consequences

One run lists #1, #2 and #3, and cannot pass while #1 exists. The fixture goes when #1 closes.
