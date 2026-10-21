import { expect, TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'fs/promises';
import { extractText, getDocumentProxy, renderPageAsImage } from 'unpdf';
import { CheckoutCompletePage } from '../pages/checkout-complete.page';
import { expectedTotals, LineItem } from '../utils/read';
import { orderOf } from '../utils/step';
import { KNOWN, SEEN_ONLY } from './issues';
import { test as userTest } from './user.fixture';

// Jev's largest image side: page 1 is rendered with its longest side at it (ADR 0020).
const IMAGE_SIDE = 1568;
const PDF_MAGIC = `%PDF-`;
const DOWNLOADED = `Generate PDF order should download the receipt as a PDF, for the AI judge (R-DONE-7, ADR 0020)`;

/** What the receipt says, line by line, and the runner's day of its download. */
type ReceiptEvidence = { lines: string[]; downloadedOn: string };

/** Downloads the receipt, keeps it as receipt.pdf and page 1 as receipt.png, and returns its text. */
async function keepReceipt(
    complete: CheckoutCompletePage,
    testInfo: TestInfo,
): Promise<ReceiptEvidence> {
    const download = await complete.generateOrderPdf();
    // The local day, as the browser on this machine dates the receipt: "2026-10-21".
    const downloadedOn = new Date().toLocaleDateString(`en-CA`);
    const failure = download ? await download.failure() : `no download started`;
    const pdfPath = testInfo.outputPath(`receipt.pdf`);
    if (download && !failure) await download.saveAs(pdfPath);
    const bytes = failure ? new Uint8Array() : new Uint8Array(await readFile(pdfPath));
    const head = new TextDecoder().decode(bytes.subarray(0, PDF_MAGIC.length));
    // A precondition of the evidence, not a check of the receipt: Jev judges that (ADR 0020).
    expect(
        failure ?? (head === PDF_MAGIC ? `a PDF` : `${bytes.length} bytes, not a PDF`),
        DOWNLOADED,
    ).toBe(`a PDF`);
    await testInfo.attach(`receipt.pdf`, { path: pdfPath, contentType: `application/pdf` });

    // A copy each: pdf.js takes over the buffer it is given.
    const pdf = await getDocumentProxy(bytes.slice());
    const { text } = await extractText(pdf, { mergePages: true });
    const { width, height } = (await pdf.getPage(1)).getViewport({ scale: 1 });
    const png = await renderPageAsImage(bytes.slice(), 1, {
        canvasImport: () => import('@napi-rs/canvas'),
        scale: IMAGE_SIDE / Math.max(width, height),
    });
    const pngPath = testInfo.outputPath(`receipt.png`);
    await writeFile(pngPath, new Uint8Array(png));
    await testInfo.attach(`receipt.png`, { path: pngPath, contentType: `image/png` });
    return {
        lines: text
            .split(`\n`)
            .map((line) => line.trim())
            .filter(Boolean),
        downloadedOn,
    };
}

// After the test, the order receipt for the AI judge: the spec stops at the confirmation (ADR 0019, 0020).
export const test = userTest.extend<{ receiptEvidence: void }>({
    receiptEvidence: [
        async ({ page, user, browserName }, use, testInfo) => {
            await use();
            const ordered = orderOf(testInfo);
            const products = (ordered.products ?? []) as LineItem[];
            const evidence = {
                test: testInfo.title,
                project: testInfo.project.name,
                browser: browserName,
                user,
                seed: process.env.FAKER_SEED,
                // The user's open issues, so the judge can tell known from new; never sent to Jev.
                issues: [...Object.keys(KNOWN[user]).map(Number), ...SEEN_ONLY[user]],
                order: { customer: ordered.customer, products, totals: expectedTotals(products) },
                // Null when the test ended before the confirmation offered the PDF.
                receipt: null as ReceiptEvidence | null,
            };
            const complete = new CheckoutCompletePage(page);
            try {
                if (await complete.offersOrderPdf())
                    evidence.receipt = await keepReceipt(complete, testInfo);
            } finally {
                const path = testInfo.outputPath(`evidence.json`);
                await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`);
                await testInfo.attach(`evidence.json`, { path, contentType: `application/json` });
            }
        },
        { auto: true },
    ],
});
