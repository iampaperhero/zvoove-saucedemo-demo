import { Locator, Page } from '@playwright/test';
import { Header } from './components/header.component';
import { amount, isOpen, LineItem } from '../utils/read';
import { recordOrder, step } from '../utils/step';

export class InventoryPage {
    readonly header: Header;
    readonly sortBox: Locator;
    readonly cards: Locator;

    constructor(private readonly page: Page) {
        this.header = new Header(page);
        this.sortBox = page.getByRole('combobox', { name: 'Sort products' });
        this.cards = page.getByTestId('inventory-item');
    }

    private card(name: string): Locator {
        return this.cards.filter({ has: this.page.getByText(name, { exact: true }) });
    }

    async isOpen(): Promise<boolean> {
        return isOpen(this.page, `**/inventory.html`, this.sortBox);
    }

    /** Adds each listed product and returns the prices read off its card. */
    @step(`Add {0} to the cart`)
    async addToCart(names: string[]): Promise<LineItem[]> {
        const picked: LineItem[] = [];
        for (const name of names) {
            const card = this.card(name);
            if (!(await card.count())) continue;
            const price = amount(await card.getByTestId('inventory-item-price').innerText());
            await card.getByRole('button', { name: 'Add to cart' }).click();
            picked.push({ quantity: 1, name, price });
        }
        recordOrder(`products`, picked);
        return picked;
    }
}
