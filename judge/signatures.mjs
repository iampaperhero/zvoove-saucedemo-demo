// How each open issue the receipt shows appears in the AI judge's checklist (ADR 0020): the items
// it breaks and the shape an anomaly on one of them must have to be that issue's. An anomaly no
// signature matches is new, whatever its item; an issue without a signature is not the judge's.
// Which issues a user has comes with the evidence, from KNOWN and SEEN_ONLY (fixtures/issues.ts).

/** Signatures by issue number; `matches` gets the anomaly's `{ item, observed, expected }`. */
export const SIGNATURES = {
    // Twice the item total, tax and total.
    2: {
        items: [`receiptTotals`],
        matches: ({ observed, expected }) =>
            [`itemTotal`, `tax`, `total`].every(
                (key) => Math.abs(observed[key] - 2 * expected[key]) < 0.005,
            ),
    },
    // No order identifier, and no line that tries to be one: "Order number: undefined" is new.
    13: {
        items: [`receiptOrderNumber`],
        matches: ({ observed }) =>
            !observed.otherLines.some((line) => /\b(order|ref|id)\b|#/i.test(line)),
    },
    // No contact in the text (digits alone could be the postal code); one judged short is new.
    15: {
        items: [`receiptDocument`],
        matches: ({ observed }) =>
            !observed.some((line) =>
                /@|www\.|\.com\b|\b(street|road|avenue|suite|tel|phone|e-?mail|contact)\b/i.test(
                    line,
                ),
            ),
    },
};
