import { Locator, Page } from '@playwright/test';
import { InventoryPage } from './inventory.page';
import { step } from '../utils/step';
import { PASSWORD, Username } from '../utils/users';

export class LoginPage {
    readonly username: Locator;
    readonly password: Locator;
    readonly loginButton: Locator;

    constructor(private readonly page: Page) {
        this.username = page.getByRole('textbox', { name: 'Username' });
        this.password = page.getByRole('textbox', { name: 'Password' });
        this.loginButton = page.getByRole('button', { name: 'Login' });
    }

    // The entry point of every journey: the one `goto` of a chain of page objects (ADR 0002).
    @step(`Open the login page`)
    static async open(page: Page): Promise<LoginPage> {
        const loginPage = new LoginPage(page);
        await page.goto(`/`);
        await loginPage.loginButton.waitFor();
        return loginPage;
    }

    @step(`Log in as {0}`)
    async logIn(username: Username): Promise<InventoryPage> {
        await this.username.fill(username);
        await this.password.fill(PASSWORD);
        await this.loginButton.click();
        return new InventoryPage(this.page);
    }
}
