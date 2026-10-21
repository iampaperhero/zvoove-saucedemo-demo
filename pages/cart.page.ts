import { Locator, Page } from '@playwright/test';
import { CheckoutStepOnePage } from './checkout-step-one.page';
import { Header } from './components/header.component';
import { isOpen, LineItem, lineItems } from '../utils/read';
import { step } from '../utils/step';

export class CartPage {
    readonly header: Header;
    readonly rows: Locator;
    readonly checkoutButton: Locator;

    constructor(private readonly page: Page) {
        this.header = new Header(page);
        this.rows = page.getByTestId('inventory-item');
        this.checkoutButton = page.getByRole('button', { name: 'Checkout' });
    }

    async isOpen(): Promise<boolean> {
        return isOpen(this.page, `**/cart.html`, this.checkoutButton);
    }

    async items(): Promise<LineItem[]> {
        return lineItems(this.rows);
    }

    @step(`Start checkout`)
    async checkout(): Promise<CheckoutStepOnePage> {
        await this.checkoutButton.click();
        return new CheckoutStepOnePage(this.page);
    }
}
