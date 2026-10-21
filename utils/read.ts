import { errors, Locator, Page } from '@playwright/test';

// One deadline for URL and element, below the test timeout, so a failure is a `false`.
const OPEN_TIMEOUT = 10_000;

export type LineItem = { quantity: number; name: string; price: number };

export type Totals = { itemTotal: number; tax: number; total: number };

export async function isOpen(page: Page, url: string | RegExp, ready: Locator): Promise<boolean> {
    const deadline = Date.now() + OPEN_TIMEOUT;
    try {
        // `commit`: the element below, not the load event, says the page is ready.
        await page.waitForURL(url, { timeout: OPEN_TIMEOUT, waitUntil: 'commit' });
        // At least 1 ms: a timeout of 0 would mean no timeout at all.
        await ready.waitFor({ timeout: Math.max(deadline - Date.now(), 1) });
        return true;
    } catch (error) {
        if (error instanceof errors.TimeoutError) return false;
        throw error;
    }
}

export function amount(text: string): number {
    return Number(text.match(/\$(\d+(?:\.\d+)?)/)?.[1] ?? NaN);
}

/** The overview's totals for these items by R-CO2-6..8, in cents: the sum, 8 % tax rounded to the cent, and both. */
export function expectedTotals(items: LineItem[]): Totals {
    const itemTotal = items.reduce(
        (sum, { quantity, price }) => sum + quantity * Math.round(price * 100),
        0,
    );
    const tax = Math.round(itemTotal * 0.08);
    return { itemTotal: itemTotal / 100, tax: tax / 100, total: (itemTotal + tax) / 100 };
}

export async function lineItems(rows: Locator): Promise<LineItem[]> {
    return Promise.all(
        (await rows.all()).map(async (row) => ({
            quantity: Number(await row.getByTestId('item-quantity').innerText()),
            name: await row.getByTestId('inventory-item-name').innerText(),
            price: amount(await row.getByTestId('inventory-item-price').innerText()),
        })),
    );
}
