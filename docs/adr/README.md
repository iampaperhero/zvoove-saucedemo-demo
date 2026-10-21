# Architecture decision records

Why this suite is built the way it is. New ones start from [0000-template.md](0000-template.md).

- [0001. Record decisions as ADRs](0001-record-decisions.md)
- [0002. Code conventions: assertions in the spec, locators by role, page objects that act and read](0002-code-conventions.md)
- [0004. Stay on the latest Playwright and pin it](0004-playwright-version-and-webkit.md)
- [0005. Name the app's own failures, never retry or hide them](0005-known-failures-of-the-app.md)
- [0006. Seed the random test data](0006-seeded-test-data.md)
- [0009. Run on demand, and gate serious changes with a probe and one review](0009-manual-runs-and-probe-gate.md)
- [0010. Show the run plan and a live map of the journey before the tests](0010-run-plan.md)
- [0011. Publish one set of reports per run to Cloudflare Pages](0011-publish-reports.md)
- [0013. Patch the app around an open issue only after the test has recorded the defect](0013-temporary-workarounds.md)
- [0016. Run every test as each user, the user in the title](0016-users-in-the-title.md)
- [0017. Read the order receipt PDF with unpdf](0017-receipt-pdf-text.md) (superseded by 0019)
- [0018. Fail the job on any failed test, and tell known failures from new ones](0018-known-failures-verdict.md)
- [0019. Leave the order receipt PDF to the LLM judge, outside Playwright](0019-receipt-pdf-outside-playwright.md)
- [0020. Judge the order receipt with Jev, from its image and its text, blind, advisory](0020-ai-judge.md)
