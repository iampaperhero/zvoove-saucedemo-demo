import { expect } from '@playwright/test';
import { CheckoutStepOnePage, Customer } from '../pages/checkout-step-one.page';
import { issueUrl, KNOWN } from './issues';
import { test as userTest } from './user.fixture';

const ISSUE = issueUrl(1);
const EXPIRED = `Last Name kept what was typed: issue #1 looks fixed, remove the workaround (ADR 0013)`;
const REFUSED = `Continue should be refused on step one before the workaround for issue #1 patches the app (ADR 0013)`;

// The first same-shape branch of the onChange right before testId:`lastName`; minified names change per build.
const PROBLEM_USER_BRANCH =
    /(?<=onChange:([\w$]+)=>\{)if\([\w$]+\(\)\)return [\w$]+\(\1\.target\.value\);(?=[^}]*\},testId:`lastName`)/g;

export type LastNameWorkaround = {
    /** If Last Name lost what was typed (#1), patches the app and types again (ADR 0013). */
    applyIfNeeded(stepOne: CheckoutStepOnePage, customer: Customer): Promise<void>;
};

export const test = userTest.extend<{ lastNameWorkaround: LastNameWorkaround }>({
    lastNameWorkaround: async ({ page, user }, use, testInfo) => {
        // From the start, so the bundle is captured as the login page loads it.
        let bundle: Promise<{ url: string; source: string } | null> | undefined;
        page.on(`response`, (response) => {
            if (bundle || !/^\/assets\/index-[^/]+\.js$/.test(new URL(response.url()).pathname))
                return;
            bundle = response.text().then(
                (source) => ({ url: response.url(), source }),
                () => null,
            );
        });

        const applyIfNeeded = async (stepOne: CheckoutStepOnePage, customer: Customer) => {
            if ((await stepOne.fields()).lastName === customer.lastName) {
                // Only a user known to have #1 can have it fixed; for the others nothing to say.
                if (!(1 in KNOWN[user])) return;
                testInfo.annotations.push({ type: `workaround-expired`, description: EXPIRED });
                await testInfo.attach(`issue-2 workaround expired`, {
                    body: `${EXPIRED}\n`,
                    contentType: `text/plain`,
                });
                return;
            }
            // A precondition of the patch: it must never hide a form that accepts an empty Last Name (ADR 0005).
            await stepOne.continue();
            await expect.poll(() => stepOne.error(), { message: REFUSED }).not.toBeNull();
            await testInfo.attach(`issue-2 before patch`, {
                body: `${await stepOne.error()}\n`,
                contentType: `text/plain`,
            });
            await testInfo.attach(`issue-2 before patch`, {
                body: await page.screenshot({ fullPage: true }),
                contentType: `image/png`,
            });

            const served = await bundle;
            expect(
                served,
                `The app's bundle /assets/index-<hash>.js, which the workaround for issue #1 patches, should have loaded (ADR 0013)`,
            ).toBeTruthy();
            const { url, source } = served!;
            const removed = source.match(PROBLEM_USER_BRANCH) ?? [];
            expect(
                removed,
                `The workaround for issue #1 no longer applies: the Last Name handler in ${url} changed (ADR 0013)`,
            ).toHaveLength(1);

            const patched = source.replace(PROBLEM_USER_BRANCH, ``);
            await page.route(url, async (route) =>
                route.fulfill({ response: await route.fetch(), body: patched }),
            );
            // Before the reload: a failure the patch causes carries the mark too.
            testInfo.annotations.push({
                type: `workaround-applied`,
                description: `Issue #1 (${ISSUE}): Last Name handler patched in ${url}; every check from here on runs on a patched app`,
            });
            await testInfo.attach(`issue-2 patch`, {
                body: `Removed from ${url}:\n${removed[0]}\n`,
                contentType: `text/plain`,
            });

            await page.reload();
            expect(
                await stepOne.isOpen(),
                `The reload should keep step one open for the patched handler (ADR 0013)`,
            ).toBe(true);
            await stepOne.fill(customer);
            await expect
                .poll(() => stepOne.fields(), {
                    message: `Each field should hold what was typed on the patched handler: this checks the patch, not the app (issue #1, ADR 0013)`,
                })
                .toEqual(customer);
        };

        await use({
            // Awaited, so the boxed step reports an error at the spec line that called it.
            applyIfNeeded: async (stepOne, customer) => {
                await userTest.step(
                    `Get past issue #1 if it reproduces (ADR 0013)`,
                    () => applyIfNeeded(stepOne, customer),
                    { box: true },
                );
            },
        });
    },
});
