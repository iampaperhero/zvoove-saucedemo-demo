import { Page, test, TestInfo } from '@playwright/test';

// Per running test: what the journey ordered, by key, for the receipt's evidence (ADR 0020).
const orders = new WeakMap<TestInfo, Record<string, unknown>>();

/** Records `value` as `key` of what the running test ordered, for the AI judge (ADR 0020). */
export function recordOrder(key: string, value: unknown): void {
    const info = test.info();
    orders.set(info, { ...orders.get(info), [key]: value });
}

/** What the test ordered, as `recordOrder` recorded it. */
export const orderOf = (info: TestInfo): Record<string, unknown> => orders.get(info) ?? {};

// An argument in a step title: a list joined with " and ", as in the test titles; an object as its values.
const shown = (value: unknown): string =>
    Array.isArray(value)
        ? value.join(` and `)
        : typeof value === `object` && value !== null
          ? Object.values(value).join(`, `)
          : String(value);

/** Runs the method as a boxed step titled with `{0}`, `{1}`, … as its arguments (ADR 0002). */
export function step(title: string) {
    return function <This, Args extends unknown[], Return>(
        method: (this: This, ...args: Args) => Promise<Return>,
    ) {
        // Awaited, not returned: the box needs the caller's frame on the stack to point at it.
        return async function (this: This, ...args: Args): Promise<Return> {
            const named = title.replace(/\{(\d+)\}/g, (_, index) => shown(args[Number(index)]));
            return await test.step(named, () => method.apply(this, args), { box: true });
        };
    };
}

/** Runs a soft check as a step titled with its message, with a screenshot if it fails (ADR 0002). */
export async function check(
    page: Page,
    message: string,
    assertion: (message: string) => Promise<void>,
): Promise<void> {
    await test.step(
        message,
        async () => {
            const info = test.info();
            const errors = info.errors.length;
            await assertion(message);
            if (info.errors.length > errors)
                await info.attach(`failed: ${message}`, {
                    body: await page.screenshot({ fullPage: true }),
                    contentType: `image/png`,
                });
        },
        { box: true },
    );
}
