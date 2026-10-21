# 0020. Judge the order receipt with Jev, from its image and its text, blind, advisory

- **Status:** accepted
- **Date:** 2026-10-20 (the judge of the whole journey); 2026-10-21 the receipt only, taken
  after the test by a fixture (ADR 0019). Numbered 0019 until main took that number.

## Context

The assignment asks for AI that judges results and flags suspicious behaviour. Since ADR 0019
the journey stops at the confirmation, so no check reads the order receipt PDF: whether it
identifies the order (#13), bills what was ordered (#2), reads as a document and names a seller
to contact (#15) is left to the judge. On 2026-10-21 the user decided that the judge reads only
the receipt: the journey's checks decide everything else.

From 2026-10-20 the judge read the whole journey (17 items, from the page objects' `@observed`
readers), measured over runs 33 to 63. What stays: the request is blind (a prototype carrying
the failure messages let the model copy the answer); code decides what code can (a fake that
flags "observed differs from expected" passed the first golden set, so Jev decided nothing);
one question per judged item; wording tuned on the cases it is measured on proves nothing.

Jev, as OpenRouter's documentation said on 2026-10-20: `typesafe/jev-1.14`, a "System One"
decision model answering typed questions with probabilities (Noul, Score). Images go to the
**Decisions API**, `POST /api/alpha/decisions`, `state` an array of strings and
`{ "type": "image_url", "image_url": { "url": "data:image/png;base64,…" } }`; PNG or JPEG, each
side 256 to 1 568 px, 78 400 to 2 458 624 px in all, 32 MiB a request. A request with an image
runs in the slower, less accurate long-context mode, and image input is an early feature whose
format may change. OpenRouter reserves credit for `max_tokens` and answers 402 when the balance
cannot cover it.

## Decision

- **The receipt, after the test.** The auto fixture `receiptEvidence`
  (`fixtures/receipt-evidence.fixture.ts`) runs at teardown. If the confirmation offers
  "Generate PDF order", it clicks it (`CheckoutCompletePage.generateOrderPdf`) and asserts only
  its own precondition, a download that is a PDF ("Generate PDF order should download the
  receipt as a PDF, for the AI judge (R-DONE-7, ADR 0020)", in no user's `KNOWN`). It keeps
  `receipt.pdf`, renders page 1 with unpdf's `renderPageAsImage` on `@napi-rs/canvas` (pinned
  1.0.12) with its longest side at 1 568 px as `receipt.png`, and writes `evidence.json`: test,
  project, browser, user, seed, the user's open issues (`KNOWN` and `SEEN_ONLY`), the order
  (the customer `fill` typed and the products `addToCart` read, kept by `recordOrder`, with
  their `expectedTotals`), and the receipt's text lines with `downloadedOn`, the runner's day.
  All three are attached to the report. A test that ends before the confirmation leaves
  `receipt: null` and no PDF. The spec stays as ADR 0019 has it.
- **The reading is the judge's.** `judge/checklist.mjs` parses the lines (ship-to, items,
  totals, which lines are known blocks) and holds seven items:
  - decided by code, a difference after formatting tolerance is the anomaly and Jev only rates
    its severity: `receiptShipTo`, `receiptItems`, `receiptTotals`, `receiptDate` (the Order
    Date's day against `downloadedOn`; browser and runner share a clock);
  - decided by Jev from the image and the text, a Noul each, an anomaly at 0.5 or more
    (`JUDGE_THRESHOLD`): `receiptOrderNumber` (R-DONE-9), `receiptLayout` (R-DONE-10),
    `receiptDocument` (R-DONE-11).
- **Blind.** The request carries the requirement texts of the items sent, the receipt's values,
  the customer and the products; never the user, the failures, the known issues or their
  signatures. Every user's receipt is judged on its own, so a run of one user is judged too;
  browsers with the same request share a call.
- **Known or new, in code.** `SIGNATURES` in `judge/signatures.mjs`: #2 `receiptTotals` all
  three doubled; #13 `receiptOrderNumber` with no line that tries to be an id; #15
  `receiptDocument` with no contact in the text. Each applies to the issues the evidence lists
  for its user: `KNOWN` (#2 for `problem_user`) and `SEEN_ONLY` (#13 and #15 for both users: no
  test fails on them), both in `fixtures/issues.ts`. The judge imports no TypeScript: the user
  names come from the environment, which only the tests need. Any other anomaly is
  **NEW**; a known issue no anomaly matches is a **miss**.
- **Golden set first.** `judge/golden`, 14 cases made by `npm run judge:golden:make` from two
  live receipts of 2026-10-21: 9 tuning (`clean`, `totals-doubled`, `no-order-number`,
  `no-seller-contact`, `text-cut-off`, `no-logo`, `ship-to-other-customer`, `date-other-day`,
  `live-standard`) and 5 held-out (`confirmation-code`, `order-number-undefined`,
  `overlapping-text`, `blank-header`, `live-problem`), sent once per run. A case passes when
  its flagged items with issue or NEW are exactly the expected ones; a probability within 0.2
  of the threshold is reported as a thin margin. Wording is changed against tuning cases only;
  a change that fails a held-out case is rejected; one change per attempt, one CI run before and
  one after.
- **Exit codes.** 0 as known; 1 NEW (golden: a case wrong); 3 a miss; 4 a test left no receipt
  (said per user, not an error); 2 no `OPENROUTER_API_KEY`, evidence lacking what the checklist
  reads, no `receipt.png` beside a receipt or one over Jev's limits, an answer it cannot read,
  an OpenRouter refusal, or any crash.
- **Advisory.** The judge's job is `continue-on-error`: its verdict changes neither the run's
  result nor the probe gate.
- **Filing issues** (`file_issues`, dispatch only, a job of its own with `issues: write`, after
  a passed golden set and a verdict without error): one issue per checklist item with a NEW
  anomaly, listing every user whose receipt shows it, labelled `bug` and `AI`, unless an open
  issue names the item, whatever its user.

## Consequences

Measured with Jev on CI before main's ADR 0019: the golden set passed 14 of 14 in runs
39519218816 and 39520450119, verdict known; the first flagged `receiptDocument` at 0.93 and 0.95
for both users, filed as #15. Since then the evidence is the fixture's and the overview's
requirement ids and texts are main's (R-CO2-6..8), so the request for a receipt with doubled
totals differs from the one measured; the observed values and the order sent are the same for
every golden case. The next CI run with the secret measures it again.

The receipt, its fake customer included, leaves the runner for OpenRouter and TypeSafe:
acceptable for a demo shop. A new receipt item, layout or issue changes `ITEMS`, `SIGNATURES`
and the golden set together; a new Jev version is a decision (`JUDGE_MODEL`, the golden set, the
trial again).
