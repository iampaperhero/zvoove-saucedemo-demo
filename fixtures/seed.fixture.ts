import { test as base } from '@playwright/test';
import { faker } from '@faker-js/faker/locale/en';

// The run's seed before every test, so FAKER_SEED replays a failed test's data (ADR 0006).
export const test = base.extend<{ seed: void }>({
    seed: [
        async ({}, use, testInfo) => {
            const seed = process.env.FAKER_SEED ?? ``;
            faker.seed(Number(seed));
            testInfo.annotations.push({ type: `faker seed`, description: `FAKER_SEED=${seed}` });
            await use();
        },
        { auto: true },
    ],
});
