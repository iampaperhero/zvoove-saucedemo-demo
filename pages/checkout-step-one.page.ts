import { Locator, Page } from '@playwright/test';
import { CheckoutStepTwoPage } from './checkout-step-two.page';
import { Header } from './components/header.component';
import { isOpen } from '../utils/read';
import { recordOrder, step } from '../utils/step';

export type Customer = { firstName: string; lastName: string; postalCode: string };

export class CheckoutStepOnePage {
    readonly header: Header;
    readonly firstName: Locator;
    readonly lastName: Locator;
    readonly postalCode: Locator;
    readonly continueButton: Locator;
    readonly errorBanner: Locator;

    constructor(private readonly page: Page) {
        this.header = new Header(page);
        this.firstName = page.getByRole('textbox', { name: 'First Name' });
        this.lastName = page.getByRole('textbox', { name: 'Last Name' });
        this.postalCode = page.getByRole('textbox', { name: 'Zip/Postal Code' });
        this.continueButton = page.getByRole('button', { name: 'Continue' });
        this.errorBanner = page.getByRole('alert');
    }

    async isOpen(): Promise<boolean> {
        return isOpen(this.page, `**/checkout-step-one.html`, this.firstName);
    }

    @step(`Enter the customer information: {0}`)
    async fill(customer: Customer): Promise<void> {
        recordOrder(`customer`, customer);
        // Typed key by key as a user would: problem_user's keystrokes land in the wrong field.
        await this.firstName.pressSequentially(customer.firstName);
        await this.lastName.pressSequentially(customer.lastName);
        await this.postalCode.pressSequentially(customer.postalCode);
    }

    // Read by the spec once typing is done, and by the #1 workaround's guards (ADR 0002).
    async fields(): Promise<Customer> {
        return {
            firstName: await this.firstName.inputValue(),
            lastName: await this.lastName.inputValue(),
            postalCode: await this.postalCode.inputValue(),
        };
    }

    /** The error banner's text, e.g. "Error: Last Name is required", or `null` while none is shown. */
    async error(): Promise<string | null> {
        return (await this.errorBanner.isVisible()) ? this.errorBanner.innerText() : null;
    }

    @step(`Submit the customer information`)
    async continue(): Promise<CheckoutStepTwoPage> {
        await this.continueButton.click();
        return new CheckoutStepTwoPage(this.page);
    }
}
