// Makes the AI judge's golden set (ADR 0020) from the two live receipts in judge/golden: page 1
// of each as the test renders it (live-*.png) and the evidence.json of its run (live-*.json).
// Each case paints onto a copy of the image what a receipt would show (an order number, the
// seller's contact, a seeded defect) and writes the text the test would read from it, so image
// and text agree; cases.json lists every case with its set and what it must come out as.
//
// npm run judge:golden:make   after replacing live-*.json and live-*.png with a new run's
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DIR = `judge/golden`;
// The live receipt's colours, fonts and places in px of page 1 at 1108 × 1568, measured 2026-10-21.
const INK = `rgb(19, 35, 34)`;
const GREY = `rgb(107, 117, 115)`;
const DETAILS_FONT = `20.5px Helvetica`;
const FOOTER_FONT = `18.5px Helvetica`;
const [LEFT, RIGHT, CENTRE] = [75, 1034, 554];
const HEADER = 169; // the dark band with the wordmark and "Order Receipt"
const LOGO = [40, 45, 222, 52]; // the green "Swag Labs" wordmark, padded
const DATE_BASELINE = 261;
const BELOW_DATE = 284; // the gap between the Order Date row and SHIP TO
const ROW = 40; // the details rows' pitch
const TAX_TOP = 632;
const THANKS = [843, 861]; // the thank-you sentence's rows

/** A case under way: its evidence, its receipt's lines and its page 1, and how far rows moved down. */
async function start(from) {
    const evidence = JSON.parse(readFileSync(join(DIR, `${from}.json`), `utf8`));
    const image = await loadImage(readFileSync(join(DIR, `${from}.png`)));
    const canvas = createCanvas(image.width, image.height);
    canvas.getContext(`2d`).drawImage(image, 0, 0);
    return { evidence, receipt: evidence.receipt, canvas, ctx: canvas.getContext(`2d`), down: 0 };
}

const snapshot = (canvas) => {
    const copy = createCanvas(canvas.width, canvas.height);
    copy.getContext(`2d`).drawImage(canvas, 0, 0);
    return copy;
};

/** A details row under the Order Date, "<label>   <value>", as the receipt would print one. */
const detailsRow = (label, value) => (c) => {
    const { canvas, ctx } = c;
    const before = snapshot(canvas);
    const height = canvas.height - BELOW_DATE - ROW;
    ctx.fillStyle = `white`;
    ctx.fillRect(0, BELOW_DATE, canvas.width, ROW);
    ctx.drawImage(
        before,
        0,
        BELOW_DATE,
        canvas.width,
        height,
        0,
        BELOW_DATE + ROW,
        canvas.width,
        height,
    );
    ctx.fillStyle = INK;
    ctx.font = DETAILS_FONT;
    ctx.textAlign = `left`;
    ctx.fillText(label, LEFT, DATE_BASELINE + ROW);
    ctx.textAlign = `right`;
    ctx.fillText(value, RIGHT, DATE_BASELINE + ROW);
    const at = c.receipt.lines.findIndex((line) => line.startsWith(`Order Date `)) + 1;
    c.receipt.lines.splice(at, 0, `${label} ${value}`);
    c.down += ROW;
};

const SELLER = [
    `Swag Labs, Inc. · 1 Market Street, San Francisco, CA 94105`,
    `support@swaglabs.example · +1 (415) 555-0134`,
];
/** The seller's address and contact, two grey lines under the thank-you. */
const seller = (c) => {
    c.ctx.fillStyle = GREY;
    c.ctx.font = FOOTER_FONT;
    c.ctx.textAlign = `center`;
    SELLER.forEach((line, i) => c.ctx.fillText(line, CENTRE, THANKS[1] + c.down + 36 + 28 * i));
    c.receipt.lines.push(...SELLER);
};

/** Everything under the header 110 px to the right: the right column runs off the page. */
const cutOff = ({ canvas, ctx }) => {
    const before = snapshot(canvas);
    const height = canvas.height - HEADER;
    ctx.fillStyle = `white`;
    ctx.fillRect(0, HEADER, canvas.width, height);
    ctx.drawImage(before, 0, HEADER, canvas.width, height, 110, HEADER, canvas.width, height);
};

/** The wordmark painted over in the band's colour: "Order Receipt" alone heads the page. */
const noLogo = ({ ctx }) => {
    ctx.fillStyle = INK;
    ctx.fillRect(...LOGO);
};

/** No header at all: the band, the wordmark and the title gone from the image. */
const blankHeader = ({ canvas, ctx }) => {
    ctx.fillStyle = `white`;
    ctx.fillRect(0, 0, canvas.width, HEADER);
};

/** The thank-you sentence moved from the footer onto the Tax row, so the two overlap. */
const overlap = (c) => {
    const before = snapshot(c.canvas);
    const [top, bottom] = THANKS.map((y) => y + c.down);
    const width = c.canvas.width - 200;
    c.ctx.fillStyle = `white`;
    c.ctx.fillRect(100, top - 4, width, bottom - top + 8);
    c.ctx.globalCompositeOperation = `darken`;
    c.ctx.drawImage(
        before,
        100,
        top - 4,
        width,
        bottom - top + 8,
        100,
        TAX_TOP + c.down,
        width,
        bottom - top + 8,
    );
    c.ctx.globalCompositeOperation = `source-over`;
};

/** The order typed for someone else: the receipt ships to a customer the test did not type. */
const otherCustomer = ({ evidence }) => {
    evidence.order.customer = { firstName: `Mireille`, lastName: `Dubois`, postalCode: `75011` };
};

/** Downloaded a day after the receipt's Order Date. */
const nextDay = ({ receipt }) => {
    const day = new Date(`${receipt.downloadedOn}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1);
    receipt.downloadedOn = day.toISOString().slice(0, 10);
};

const ORDER_NUMBER = detailsRow(`Order Number`, `SL-2026-104729`);

// The cases: made from a live receipt, or the live receipt as it is. Tuning cases may justify a
// wording change, held-out ones never (ADR 0020); every one written on 2026-10-21, before any run.
const CASES = [
    {
        file: `clean`,
        from: `live-standard`,
        set: `tuning`,
        make: [ORDER_NUMBER, seller],
        expect: [],
    },
    {
        file: `totals-doubled`,
        from: `live-problem`,
        set: `tuning`,
        make: [ORDER_NUMBER, seller],
        expect: [`receiptTotals #2`],
    },
    {
        file: `no-order-number`,
        from: `live-standard`,
        set: `tuning`,
        make: [seller],
        expect: [`receiptOrderNumber #13`],
    },
    {
        file: `no-seller-contact`,
        from: `live-standard`,
        set: `tuning`,
        make: [ORDER_NUMBER],
        expect: [`receiptDocument #15`],
    },
    {
        file: `text-cut-off`,
        from: `live-standard`,
        set: `tuning`,
        make: [ORDER_NUMBER, seller, cutOff],
        expect: [`receiptLayout NEW`],
    },
    {
        file: `no-logo`,
        from: `live-standard`,
        set: `tuning`,
        make: [ORDER_NUMBER, seller, noLogo],
        expect: [`receiptLayout NEW`],
    },
    {
        file: `ship-to-other-customer`,
        from: `live-standard`,
        set: `tuning`,
        make: [ORDER_NUMBER, seller, otherCustomer],
        image: `clean`,
        expect: [`receiptShipTo NEW`],
    },
    {
        file: `date-other-day`,
        from: `live-standard`,
        set: `tuning`,
        make: [ORDER_NUMBER, seller, nextDay],
        image: `clean`,
        expect: [`receiptDate NEW`],
    },
    {
        file: `live-standard`,
        set: `tuning`,
        expect: [`receiptOrderNumber #13`, `receiptDocument #15`],
    },
    {
        file: `confirmation-code`,
        from: `live-standard`,
        set: `held-out`,
        make: [detailsRow(`Confirmation`, `7F3K-22X9`), seller],
        expect: [],
    },
    {
        file: `order-number-undefined`,
        from: `live-standard`,
        set: `held-out`,
        make: [detailsRow(`Order Number`, `undefined`), seller],
        expect: [`receiptOrderNumber NEW`],
    },
    {
        file: `overlapping-text`,
        from: `live-standard`,
        set: `held-out`,
        make: [ORDER_NUMBER, seller, overlap],
        expect: [`receiptLayout NEW`],
    },
    {
        file: `blank-header`,
        from: `live-standard`,
        set: `held-out`,
        make: [ORDER_NUMBER, seller, blankHeader],
        expect: [`receiptLayout NEW`],
    },
    {
        file: `live-problem`,
        set: `held-out`,
        expect: [`receiptTotals #2`, `receiptOrderNumber #13`, `receiptDocument #15`],
    },
];

// A case whose defect is in the evidence alone shares the image of the case it names.
for (const { file, from, make = [], image } of CASES.filter(({ from }) => from)) {
    const c = await start(from);
    for (const step of make) step(c);
    writeFileSync(join(DIR, `${file}.json`), `${JSON.stringify(c.evidence, null, 2)}\n`);
    if (!image) writeFileSync(join(DIR, `${file}.png`), await c.canvas.encode(`png`));
}
writeFileSync(
    join(DIR, `cases.json`),
    `${JSON.stringify(
        CASES.map(({ file, image = file, set, expect }) => ({
            file: `${file}.json`,
            image: `${image}.png`,
            set,
            expect,
        })),
        null,
        2,
    )}\n`,
);
console.log(`${CASES.length} golden cases in ${DIR}`);
