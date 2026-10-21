# 0011. Publish one set of reports per run to Cloudflare Pages

- **Status:** accepted
- **Date:** 2026-10-19

## Context

Each browser runs in its own job, a private repository has no free GitHub Pages, and Allure's trends need earlier runs.

## Decision

The publish job merges the jobs' results into one Allure report and deploys it to `run-<number>.<project>.pages.dev`; a run on main also updates the production address and the Allure history.

## Consequences

The reports open by link without a GitHub login; only runs on main make up the trends.
