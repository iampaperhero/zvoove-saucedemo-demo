// The AI judge's checklist (ADR 0020): the order receipt only. Each item reads one observation
// from an evidence.json, which the receiptEvidence fixture writes after the test: the order the
// test placed and the receipt's lines. A computed item also computes what the requirements expect
// of it, and code decides it; a judged item has no expected value: Jev decides it from the
// receipt's page 1 as an image, its text and whose order it was, against the requirement's text.
import { readFileSync } from 'fs';

// The receipt spaces the letters of its headings: "S H I P TO", "O R D E R D E TA I L S".
const heading = (word) => new RegExp(`^${[...word].join(` ?`)}$`);
// Lines known whole: anything added to one of them, an order number say, makes it unknown.
const KNOWN_LINES = [
    /^Swag Labs$/,
    /^Order Receipt$/,
    heading(`ORDERDETAILS`),
    /^Order Date [A-Z][a-z]+ \d{1,2}, \d{4} at \d{1,2}:\d{2} [AP]M$/,
    /^DESCRIPTION PRICE$/,
    /^Thank you for your order! It has been dispatched, and will arrive just as fast as the pony can get there\.$/,
];
const SHIP_TO = heading(`SHIPTO`);
const ITEMS_HEADING = heading(`ITEMS`);
const ITEM = /^(.+) \$(\d+\.\d{2})$/;
const TOTAL = /^(Item total|Tax|Total) \$(\d+\.\d{2})$/;

/**
 * Reads the receipt's lines: the SHIP TO block, the items and totals billed (one line per unit,
 * quantity 1, as the receipt has no quantity column), and every line, `known` if in a known
 * block, which an order number is not.
 */
function parseReceipt(text) {
    const shipStart = text.findIndex((line) => SHIP_TO.test(line));
    const itemsStart = text.findIndex((line) => ITEMS_HEADING.test(line));
    const known = new Set(
        text.flatMap((line, i) => (KNOWN_LINES.some((pattern) => pattern.test(line)) ? [i] : [])),
    );
    const hasShipTo = shipStart >= 0 && itemsStart > shipStart;
    const shipTo = hasShipTo ? text.slice(shipStart + 1, itemsStart) : [];
    if (hasShipTo) for (let i = shipStart; i < itemsStart; i++) known.add(i);
    const items = [];
    if (itemsStart >= 0) {
        known.add(itemsStart);
        for (let i = itemsStart + 1; i < text.length && !TOTAL.test(text[i]); i++) {
            const match = known.has(i) ? null : text[i].match(ITEM);
            if (!match) continue;
            items.push({ quantity: 1, name: match[1], price: Number(match[2]) });
            known.add(i);
        }
    }
    const total = (label) => {
        const index = text.findIndex((line) => TOTAL.test(line) && line.startsWith(`${label} $`));
        if (index >= 0) known.add(index);
        return index >= 0 ? Number(text[index].match(TOTAL)[2]) : NaN;
    };
    const totals = { itemTotal: total(`Item total`), tax: total(`Tax`), total: total(`Total`) };
    return {
        shipTo,
        bill: { items, totals },
        lines: text.map((line, i) => ({ text: line, known: known.has(i) })),
    };
}

// Each evidence's receipt is read once.
const read = new WeakMap();
const receipt = (evidence) => {
    if (!read.has(evidence)) read.set(evidence, parseReceipt(evidence.receipt.lines));
    return read.get(evidence);
};
const customer = (evidence) => evidence.order.customer;
const dateLine = (evidence) =>
    receipt(evidence).lines.find(({ text }) => /^Order Date /.test(text))?.text ?? ``;

const MONTHS = Array.from({ length: 12 }, (_, month) =>
    new Date(2000, month).toLocaleString(`en-US`, { month: `long` }),
);
/** "Order Date October 21, 2026 at 1:47 AM" as "2026-10-21"; any other line as it is. */
const orderDay = (line) => {
    const [, month, day, year] = line.match(/^Order Date ([A-Z][a-z]+) (\d{1,2}), (\d{4})/) ?? [];
    const number = MONTHS.indexOf(month) + 1;
    return number ? `${year}-${String(number).padStart(2, `0`)}-${day.padStart(2, `0`)}` : line;
};

/** The rows of docs/requirements.md, id to text: the one reader of that file for the judge. */
export const requirementText = new Map(
    readFileSync(new URL(`../docs/requirements.md`, import.meta.url), `utf8`)
        .split(`\n`)
        .map((line) => line.match(/^\| (R-[A-Z0-9]+-\d+) \| (.+?) \|/))
        .filter(Boolean)
        .map(([, id, text]) => [id, text]),
);

/** Whose order the receipt is for, as the test placed it: the customer typed and the products added. */
export const orderOf = (evidence) => ({
    customer: customer(evidence),
    products: evidence.order.products,
});

/**
 * The checklist: `key` names the item in the model's answer and in `SIGNATURES`, `about` what
 * it is (request text), `observed` its value and, for a computed item, `expected` the value
 * computed from what the test read. `evidence.image` is the receipt's page 1 the judge loaded.
 */
export const ITEMS = [
    {
        key: `receiptShipTo`,
        requirements: [`R-DONE-9`],
        about: `the receipt's SHIP TO lines`,
        observed: (e) => receipt(e).shipTo,
        // Name order, case, commas and spacing are formatting: "Lovelace, Ada" is Ada Lovelace.
        tolerate: ([name = ``, postalCode = ``, ...rest]) => [
            name.toLowerCase().replace(/,/g, ` `).split(/\s+/).filter(Boolean).sort().join(` `),
            postalCode.trim(),
            ...rest,
        ],
        expected: (e) => [
            `${customer(e).firstName} ${customer(e).lastName}`,
            customer(e).postalCode,
        ],
    },
    {
        key: `receiptItems`,
        requirements: [`R-DONE-9`],
        about: `the items the receipt bills`,
        observed: (e) => receipt(e).bill.items,
        expected: (e) => e.order.products,
    },
    {
        key: `receiptTotals`,
        requirements: [`R-DONE-9`, `R-CO2-6`, `R-CO2-7`, `R-CO2-8`],
        about: `the receipt's item total, tax and total`,
        observed: (e) => receipt(e).bill.totals,
        // The spec's own expectedTotals of the products, as the fixture computed them.
        expected: (e) => e.order.totals,
    },
    {
        key: `receiptDate`,
        requirements: [`R-DONE-9`],
        about: `the day of the receipt's Order Date, expected as the day it was downloaded, on the clock of the machine whose browser dated it`,
        observed: (e) => orderDay(dateLine(e)),
        expected: (e) => e.receipt.downloadedOn,
    },
    {
        key: `receiptOrderNumber`,
        requirements: [`R-DONE-9`],
        about: `the receipt's date line and every line outside its known blocks (logo, title, headings, ship-to, items, totals, thank-you), and the attached image; judged: does it carry an order number, id or reference the customer can quote, whatever its label or format?`,
        observed: (e) => ({
            dateLine: dateLine(e),
            otherLines: receipt(e)
                .lines.filter(({ known }) => !known)
                .map(({ text }) => text),
        }),
    },
    {
        key: `receiptLayout`,
        requirements: [`R-DONE-10`],
        about: `page 1 of the receipt as rendered, the attached image; judged: does it read as a document, its content within the page, no text cut off or overlapping, the logo heading it?`,
        observed: (e) => `the attached image, ${e.image.width}×${e.image.height} px`,
    },
    {
        key: `receiptDocument`,
        requirements: [`R-DONE-11`],
        about: `the receipt's text, line by line, and the attached image; judged: can the seller, with a way to contact it, and what was bought be told from it alone?`,
        observed: (e) => receipt(e).lines.map(({ text }) => text),
    },
];

/** What the checklist needs that an evidence with a receipt lacks, as "item: key". */
export function missingKeys(evidence) {
    const missing = [];
    if (!evidence.order?.products?.length) missing.push(`receiptItems: order.products`);
    if (!evidence.order?.totals) missing.push(`receiptTotals: order.totals`);
    if (!evidence.order?.customer) missing.push(`receiptShipTo: order.customer`);
    if (!evidence.receipt.lines?.length) missing.push(`every item: receipt.lines`);
    if (!evidence.receipt.downloadedOn) missing.push(`receiptDate: receipt.downloadedOn`);
    if (!Array.isArray(evidence.issues)) missing.push(`known or new: issues`);
    return missing;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The items of `evidence` to report: every judged item, for Jev to decide, and every computed
 * item whose observed value differs from the expected one after its formatting tolerance, an
 * anomaly decided by code (ADR 0020).
 */
export function itemsToJudge(evidence) {
    return ITEMS.flatMap((item) => {
        const observed = item.observed(evidence);
        if (!item.expected) return [{ item: item.key, observed }];
        const expected = item.expected(evidence);
        const tolerate = item.tolerate ?? ((value) => value);
        return same(tolerate(observed), tolerate(expected))
            ? []
            : [{ item: item.key, observed, expected }];
    });
}
