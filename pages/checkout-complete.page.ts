import { Download, errors, Locator, Page } from '@playwright/test';
import { Header } from './components/header.component';
import { isOpen } from '../utils/read';
import { step } from '../utils/step';

// The receipt starts downloading at once; a failure is a `null`, as for isOpen.
const DOWNLOAD_TIMEOUT = 10_000;

export class CheckoutCompletePage {
    readonly header: Header;
    readonly thankYouHeading: Locator;
    readonly orderPdfButton: Locator;

    constructor(private readonly page: Page) {
        this.header = new Header(page);
        this.thankYouHeading = page.getByRole('heading', { name: 'Thank you for your order!' });
        this.orderPdfButton = page.getByRole('button', { name: 'Generate PDF order' });
    }

    async isOpen(): Promise<boolean> {
        // The heading's text, so an open page is also the thank-you (R-DONE-2).
        return isOpen(this.page, `**/checkout-complete.html`, this.thankYouHeading);
    }

    // Shown only after Finish, not when the page is opened by URL (R-DONE-7).
    async offersOrderPdf(): Promise<boolean> {
        return this.orderPdfButton.isVisible();
    }

    /** Clicks "Generate PDF order" and returns the receipt's download, `null` if none starts (ADR 0020). */
    @step(`Generate the PDF order`)
    async generateOrderPdf(): Promise<Download | null> {
        try {
            const [download] = await Promise.all([
                this.page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT }),
                this.orderPdfButton.click(),
            ]);
            return download;
        } catch (error) {
            if (error instanceof errors.TimeoutError) return null;
            throw error;
        }
    }
}
