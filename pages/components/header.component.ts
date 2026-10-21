import { Locator, Page } from '@playwright/test';
import { CartPage } from '../cart.page';
import { step } from '../../utils/step';

export class Header {
    readonly openCartButton: Locator;
    readonly cartBadge: Locator;

    constructor(private readonly page: Page) {
        this.openCartButton = page.getByRole('button', { name: /^Cart, / });
        this.cartBadge = page.getByTestId('shopping-cart-badge');
    }

    /** The number on the cart badge, 0 when there is none. */
    async cartCount(): Promise<number> {
        const [text] = await this.cartBadge.allInnerTexts();
        return text ? Number(text) : 0;
    }

    @step(`Open the cart`)
    async openCart(): Promise<CartPage> {
        await this.openCartButton.click();
        return new CartPage(this.page);
    }
}
