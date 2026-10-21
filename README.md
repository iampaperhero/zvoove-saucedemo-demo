# zvoove-saucedemo-demo

End-to-end tests for [Swag Labs](https://www.saucedemo.com) with Playwright and
TypeScript: log in, add the Sauce Labs Backpack and Bike Light, check out to the
order confirmation, as `standard_user` and as `problem_user`.

## Quick start

```bash
cp .env.example .env            # the two users and their password
npm ci && npx playwright install
npm test                        # Chromium, both users
BROWSER=all npm test            # Chromium, Firefox, WebKit
SAUCE_USERS=problem_user npm test
npm run report                  # the last local HTML report
```

Docker: `docker build -t zvoove-saucedemo-demo . && docker run --ipc=host --env-file .env zvoove-saucedemo-demo`.

## Environment

Locally the variables come from `.env` (copy [.env.example](.env.example)). On CI
the workflow sets them from the repository's variables and secrets, or from the
run's inputs.

| Variable | Needed for | Locally | CI |
| --- | --- | --- | --- |
| `SAUCE_STANDARD_USER` | the tests, required | `.env`: `standard_user` | variable |
| `SAUCE_PROBLEM_USER` | the tests, required | `.env`: `problem_user` | variable |
| `SAUCE_PASSWORD` | the tests, required | `.env`: `secret_sauce` | secret |
| `BASE_URL` | the app under test | `.env`; unset, saucedemo.com | input `base_url` |
| `SAUCE_USERS` | which users run, comma-separated | optional; unset, both | input `users` |
| `BROWSER` | which browsers run | optional: `firefox`, `webkit` or `all`; unset, Chromium | input `browser` |
| `FAKER_SEED` | replaying a run's test data | optional; unset, a new seed | input `faker_seed`, else the run id |
| `OPENROUTER_API_KEY` | the AI judge only | `.env`, for `npm run judge` | secret |
| `CLOUDFLARE_PAGES_PROJECT` | publishing the reports | not needed | variable; unset, the reports stay an artifact |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | publishing the reports | only to publish by hand with Wrangler | secrets |

Without the three `SAUCE_*` values the run stops at once and says which is
missing. Keep real keys and tokens out of `.env.example`; `.env` is git ignored.

## What to expect

- **`standard_user` passes.** It is the reference.
- **`problem_user` fails** on its known bugs (#1, #2, #3, below), and its CI job
  is red until they are fixed. The verdict says whether anything else failed
  (ADR 0018).
- Each failed check is a short "expected / received" with a screenshot of the
  page on its own step in the report.

## Where things are

| | |
| --- | --- |
| The journey | [tests/checkout.spec.ts](tests/checkout.spec.ts) |
| Page objects, helpers, fixtures | [pages](pages), [utils](utils), [fixtures](fixtures) |
| Known bugs per user | [fixtures/issues.ts](fixtures/issues.ts) |
| Requirements | [docs/requirements.md](docs/requirements.md) |
| How it fits together, and why | [docs/architecture.md](docs/architecture.md), [docs/adr](docs/adr/README.md) |
| The AI judge of the order receipt | [judge](judge), [fixtures/receipt-evidence.fixture.ts](fixtures/receipt-evidence.fixture.ts) |

## CI

Runs on demand only, one job per browser and user, Chromium by default:

```bash
gh workflow run playwright.yml -R iampaperhero/zvoove-saucedemo-demo -f browser=all
```

The run plan links a live map of the journey before the tests; each test job
ends with its verdict; the run publishes an Allure report with the trends of
`main` to `run-<number>.<project>.pages.dev`. Its variables and secrets are in
[Environment](#environment).

## The AI judge of the order receipt

The journey stops at the confirmation (ADR 0019). After each test the
`receiptEvidence` fixture clicks "Generate PDF order", checks only that a PDF
arrived, and keeps `receipt.pdf`, its page 1 as `receipt.png` and
`evidence.json` (the order, the user's open issues, the receipt's lines) with
the test; a test that ends earlier leaves no receipt. The `post · AI judge`
job then judges each receipt on its own (ADR 0020):

- **Code** checks ship-to, items, totals and date against the order.
  **Jev** (TypeSafe, through OpenRouter's Decisions API) reads the image and
  the text: is there an order number (R-DONE-9), does it read as a document
  (R-DONE-10), can the seller be contacted (R-DONE-11)? It never sees the
  user, the failures or the known issues.
- **Known or new**: [judge/signatures.mjs](judge/signatures.mjs) says how #2,
  #13 and #15 show on the receipt; anything else is NEW.
- **Golden set first**: 14 receipts with one seeded defect each, 9 tuning and
  5 held-out ([judge/golden](judge/golden)), sent once per run, must come out
  exactly right.
- **Advisory**: the judge's job never fails the run. Exit 1 NEW, 3 a known
  issue missed, 4 a test left no receipt, 2 a key, evidence or OpenRouter error.
  With `file_issues` it files one issue per new item, for every user showing
  it, unless an open issue names the item.

```bash
npm run test:isolated                 # prints "results in <dir>"
npm run judge -- <dir>/results        # OPENROUTER_API_KEY in .env
npm run judge:test                    # against a fake OpenRouter, no key
```

## Known issues of the app

| Issue | Users | Tested | Defect |
| --- | --- | --- | --- |
| [#1](https://github.com/iampaperhero/zvoove-saucedemo-demo/issues/1) | problem_user | yes | Last Name writes into First Name; Continue is refused |
| [#2](https://github.com/iampaperhero/zvoove-saucedemo-demo/issues/2) | problem_user | yes | the totals are doubled |
| [#3](https://github.com/iampaperhero/zvoove-saucedemo-demo/issues/3) | problem_user | yes | Finish does not empty the cart |
| [#4](https://github.com/iampaperhero/zvoove-saucedemo-demo/issues/4) | both | no | the overview and the confirmation open by URL with an empty cart |
| [#5](https://github.com/iampaperhero/zvoove-saucedemo-demo/issues/5) | problem_user | no | sorting does nothing |
| [#6](https://github.com/iampaperhero/zvoove-saucedemo-demo/issues/6) | problem_user | no | every product shows the same image |
| [#7](https://github.com/iampaperhero/zvoove-saucedemo-demo/issues/7) | problem_user | no | Remove on the inventory does nothing |
| [#8](https://github.com/iampaperhero/zvoove-saucedemo-demo/issues/8) | problem_user | no | three products cannot be added |
| [#9](https://github.com/iampaperhero/zvoove-saucedemo-demo/issues/9) | problem_user | no | product links open another product |
| [#10](https://github.com/iampaperhero/zvoove-saucedemo-demo/issues/10) | both | no | product id=6 leaves a phantom item in the cart |
| [#11](https://github.com/iampaperhero/zvoove-saucedemo-demo/issues/11) | both | no | an unknown id renders a fake product |
| [#12](https://github.com/iampaperhero/zvoove-saucedemo-demo/issues/12) | both | no | every page but `/` answers HTTP 404 |
| [#13](https://github.com/iampaperhero/zvoove-saucedemo-demo/issues/13) | both | LLM judge | the receipt has no order number |
| [#14](https://github.com/iampaperhero/zvoove-saucedemo-demo/issues/14) | both | no | product copy shows code: `carry.allTheThings()` |
| [#15](https://github.com/iampaperhero/zvoove-saucedemo-demo/issues/15) | both | LLM judge | the receipt gives no way to contact the seller |

Each untested issue carries a reproduction prompt; labels say who found it.

## Troubleshooting

- **WebKit is skipped on macOS 14**: Playwright's WebKit no longer runs there.
  Use Docker (`-e BROWSER=webkit`) or CI (ADR 0004).

## Credits

[Alexander Timochko](https://www.linkedin.com/in/alexander-timochko/), QA Manager and Senior QA Engineer.
