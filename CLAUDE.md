# zvoove-saucedemo-demo

End-to-end tests for https://www.saucedemo.com with Playwright and
TypeScript. Start with the README; how the parts connect is in
[docs/architecture.md](docs/architecture.md), the reasons in
[docs/adr](docs/adr/README.md).

## Rules

- Code conventions are ADR 0002: assertions only in the spec, with a message
  of their own (ESLint rejects `expect` in `pages/` and `utils/`; a fixture
  asserts only its own preconditions); locators by role and visible text,
  `getByTestId` or CSS only where nothing else fits, with the reason; page
  objects act and read, carry the `@step` titles and return the next page; no
  base classes, no helper or method without a caller; comments are one line
  of why.
- Known failures of the app fail the test with a message naming the
  requirement, softly where the journey can go on; never retried or hidden.
  Each one's message is in `KNOWN` (`fixtures/issues.ts`). ADR 0005, 0018.
- A patch of the app around a defect only after the spec has recorded it,
  through a fixture with a guard. ADR 0013.
- Test data from the seeded faker. ADR 0006. The user comes from a describe
  per user of `SAUCE_USERS`, which puts it in the title; the products and the
  customer from one constant each, and titles and messages are built from
  them; a test never branches on the user. ADR 0016.
- A change to the journey's steps or pages re-renders the live map
  `docs/run-plan/map.html` in the same change. ADR 0010.
- A decision a newcomer could undo by mistake gets an ADR.

## Checks

- `npm run typecheck`, `npm run lint`, `npm run format:check` before any commit;
  a hook formats and lints every `.ts` file Claude edits.
- Run tests with `npm run test:isolated`, never into the shared `test-results/`.
- Chromium by default; `BROWSER=firefox`, `webkit` or `all` for the others.
  WebKit is skipped on macOS 14; run it in Docker
  (`docker run --ipc=host --env-file .env -e BROWSER=webkit zvoove-saucedemo-demo`).

## Workflow

- Runs are manual only, never on a pull request or a schedule. Never push to `main`;
  a hook blocks it. Agents open issues and PRs; a human merges.
- A serious change (a new test, a change of what a test, fixture, page object,
  reporter or CI job does) goes to a `probe/<topic>` branch, a probe run
  (`gh workflow run playwright.yml --ref probe/<topic>`) whose every verdict
  says "no new failure" (ADR 0018), one `critic` round, then a PR from `test/<topic>`. Anything else (docs, comments, wording) goes straight to a
  PR. ADR 0009.
- Agents: `sdet` writes, `critic` reviews once, `triage` reads a red verdict.
- `gh` commands name the repo: `-R iampaperhero/zvoove-saucedemo-demo`.
