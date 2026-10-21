import { test as base } from '@playwright/test';
import os from 'os';

// Darwin 23 is macOS 14, where Playwright's WebKit no longer runs (ADR 0004).
const MAC_OS_14 = os.platform() === `darwin` && os.release().startsWith(`23.`);

export const test = base.extend<{ webkitSupported: void }>({
    // Skips with a reason instead of failing; auto, so before any page opens.
    webkitSupported: [
        async ({ browserName }, use) => {
            base.skip(
                browserName === `webkit` && MAC_OS_14,
                `Playwright's WebKit does not run on macOS 14, run it in Docker or on CI instead`,
            );
            await use();
        },
        { auto: true },
    ],
});
