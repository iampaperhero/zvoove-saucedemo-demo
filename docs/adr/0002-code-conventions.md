# 0002. Code conventions: assertions in the spec, locators by role, page objects that act and read

- **Status:** accepted
- **Date:** 2026-10-19, merged from four ADRs 2026-10-21

## Context

saucedemo.com is a single-page app: a read right after a click can still see the old state, which looks exactly like a `problem_user` defect.

## Decision

- Page objects act and read; the spec asserts, each check with a message of its own. ESLint rejects `expect` in `pages/` and `utils/`; a fixture asserts only its own preconditions.
- Locators by role and visible text; `getByTestId` only where nothing else fits, CSS only with an `eslint-disable` reason.
- An action carries `@step(title)` and returns the next page object; every page has `isOpen()`, the URL and one element within 10 s.
- The spec reads what a page shows once it has settled (the next page open, typing done) and asserts on the plain value, so a failure reads "Expected: 0, Received: 2". Each soft check runs in `check()`, a step that attaches a screenshot when it fails.
- A later page is checked against what the earlier one showed, so a wrong value fails once.
- No method without a caller, no base class; comments are one line of why.

## Consequences

Every check is in the spec and says what it expected. Reading too early, or `fill` in place of typing, would make reads flaky or hide the Last Name defect.
