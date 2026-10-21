import { Locator, Page } from '@playwright/test';
import { CheckoutCompletePage } from './checkout-complete.page';
import { Header } from './components/header.component';
import { amount, isOpen, LineItem, lineItems, Totals } from '../utils/read';
import { step } from '../utils/step';

export class CheckoutStepTwoPage {
    readonly header: Header;
    readonly rows: Locator;
    readonly itemTotal: Locator;
    readonly tax: Locator;
    readonly total: Locator;
    readonly finishButton: Locator;

    constructor(private readonly page: Page) {
        this.header = new Header(page);
        this.rows = page.getByTestId('inventory-item');
        // Anchored: "Total:" alone would also match "Item total:".
        this.itemTotal = page.getByText(/^Item total: \$/);
        this.tax = page.getByText(/^Tax: \$/);
        this.total = page.getByText(/^Total: \$/);
        this.finishButton = page.getByRole('button', { name: 'Finish' });
    }

    async isOpen(): Promise<boolean> {
        return isOpen(this.page, `**/checkout-step-two.html`, this.finishButton);
    }

    async items(): Promise<LineItem[]> {
        return lineItems(this.rows);
    }

    async totals(): Promise<Totals> {
        return {
            itemTotal: amount(await this.itemTotal.innerText()),
            tax: amount(await this.tax.innerText()),
            total: amount(await this.total.innerText()),
        };
    }

    @step(`Complete the order`)
    async finish(): Promise<CheckoutCompletePage> {
        await this.finishButton.click();
        return new CheckoutCompletePage(this.page);
    }
}
