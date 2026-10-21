import { faker } from '@faker-js/faker/locale/en';
import { expect } from '@playwright/test';
import { test } from '../fixtures';
import { issues } from '../fixtures/issues';
import { LoginPage } from '../pages/login.page';
import { expectedTotals } from '../utils/read';
import { check } from '../utils/step';
import { usersToRun } from '../utils/users';

// Content checks are soft: one run records every defect while the journey goes on (ADR 0013).
const softly = expect.configure({ soft: true });
const PRODUCTS = [`Sauce Labs Backpack`, `Sauce Labs Bike Light`];

// A describe per user of SAUCE_USERS, so the title names the user (ADR 0016); the body never branches on it.
for (const user of usersToRun(process.env.SAUCE_USERS || undefined)) {
    test.describe(user, () => {
        test.use({ user });

        test(
            `buys ${PRODUCTS.join(` and `)}`,
            { tag: `@e2e`, annotation: issues(1, 2, 3) },
            async ({ page, user, lastNameWorkaround }) => {
                // From the seeded faker (ADR 0006).
                const customer = {
                    firstName: faker.person.firstName(),
                    lastName: faker.person.lastName(),
                    postalCode: faker.location.zipCode(),
                };
                const loginPage = await LoginPage.open(page);
                const inventory = await loginPage.logIn(user);
                expect(await inventory.isOpen(), `${user} should log in`).toBe(true);

                const chosen = await inventory.addToCart(PRODUCTS);
                const order = { items: chosen, totals: expectedTotals(chosen) };

                const cart = await inventory.header.openCart();
                expect(await cart.isOpen(), `The cart should open`).toBe(true);
                // Read once the cart has opened, so the badge has settled.
                await check(page, `${PRODUCTS.join(` and `)} should be in the cart`, async (m) =>
                    softly(await cart.header.cartCount(), m).toBe(PRODUCTS.length),
                );
                await check(page, `The cart should list them as read`, async (m) =>
                    softly(await cart.items(), m).toEqual(order.items),
                );

                const stepOne = await cart.checkout();
                expect(await stepOne.isOpen(), `Checkout should open step one`).toBe(true);

                await stepOne.fill(customer);
                // Read once typing is done, all three in one value, so #1 fails once.
                await check(page, `Each field should hold what was typed`, async (m) =>
                    softly(await stepOne.fields(), m).toEqual(customer),
                );
                await lastNameWorkaround.applyIfNeeded(stepOne, customer);

                const overview = await stepOne.continue();
                expect(await overview.isOpen(), `The overview should open`).toBe(true);
                await check(page, `The overview should match the cart`, async (m) =>
                    softly(
                        { items: await overview.items(), totals: await overview.totals() },
                        m,
                    ).toEqual(order),
                );

                const complete = await overview.finish();
                expect(await complete.isOpen(), `Finish should say thank you`).toBe(true);
                await check(page, `The cart should be empty`, async (m) =>
                    softly(await complete.header.cartCount(), m).toBe(0),
                );
                expect(await complete.offersOrderPdf(), `It should offer the order PDF`).toBe(true);
            },
        );
    });
}
