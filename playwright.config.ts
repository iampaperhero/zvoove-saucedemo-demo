import { defineConfig, devices } from '@playwright/test';

// .env configures a run without prefixing the command, see .env.example.
import 'dotenv/config';

// One faker seed per run, set here so every worker inherits it (ADR 0006).
process.env.FAKER_SEED ??= String(Math.floor(Math.random() * 2 ** 31));

// A different viewport per browser: common laptop, Full HD and a phone.
const ALL_BROWSERS = [
    { name: 'chromium-desktop-1280x720', use: { ...devices['Desktop Chrome'] } },
    {
        name: 'firefox-desktop-1920x1080',
        use: { ...devices['Desktop Firefox'], viewport: { width: 1920, height: 1080 } },
    },
    { name: 'webkit-iphone12-390x844', use: { ...devices['iPhone 12'] } },
];

// Chromium unless BROWSER names another, by the start of its name, or `all`.
const BROWSER = process.env.BROWSER || 'chromium';
const BROWSERS = ALL_BROWSERS.filter(({ name }) => BROWSER === 'all' || name.startsWith(BROWSER));
if (!BROWSERS.length) throw new Error(`BROWSER=${BROWSER} matches no browser`);

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    // Not on CI either: the app's own failures are never retried (ADR 0005).
    retries: 0,
    workers: process.env.CI ? 1 : undefined,

    // On GitHub Actions only (Docker sets CI too); the publish job merges the jobs' results.
    reporter: process.env.GITHUB_ACTIONS
        ? [
              ['github'],
              ['allure-playwright'],
              ['./reporters/mindmap.reporter.ts'],
              ['./reporters/verdict.reporter.ts'],
          ]
        : 'html',

    use: {
        baseURL: process.env.BASE_URL ?? `https://www.saucedemo.com`,

        // The app's test ids are `data-test`; getByTestId only where no role fits (ADR 0002).
        testIdAttribute: 'data-test',

        // Full page, so content below the fold is still in the screenshot.
        screenshot: { mode: 'only-on-failure', fullPage: true },

        // Not `on-first-retry`: retries are 0, which would mean no trace.
        trace: 'retain-on-failure',
    },

    // A project per browser, not per user: the spec runs each user in a describe of its own (ADR 0016).
    projects: BROWSERS,
});
