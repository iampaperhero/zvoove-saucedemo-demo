# Requirements of https://www.saucedemo.com

What the app should do, one checkable statement per id, as `standard_user`
sees it (the reference) and as the app's source
([sample-app-web](https://github.com/saucelabs/sample-app-web) at `292ffbc`)
says; collected 2026-10-19. **Test** is where it is checked: `journey` for
`tests/checkout.spec.ts`, an issue number for a known breach without a test,
`—` for neither. Behaviour nothing checks and no issue cites (page titles,
the footer, the menu, the login errors…) is left out.

## Journey (the assignment)

| ID | Requirement | Test |
| --- | --- | --- |
| R-A-1 | A user can log in. | journey |
| R-A-2 | The Backpack and the Bike Light can be added to the cart. | journey |
| R-A-3 | The cart shows both and leads to checkout. | journey |
| R-A-4 | Checkout asks for customer information; Continue leads on. | journey |
| R-A-5 | Finish completes the order. | journey |
| R-A-6 | Backpack + Bike Light: item total $39.98, tax $3.20, total $43.18. | journey |

## Every logged-in page

| ID | Requirement | Test |
| --- | --- | --- |
| R-COM-3 | The badge counts the distinct items in the cart; no badge when it is empty. | journey; #10 |
| R-COM-9 | The cart link opens `/cart.html`. | journey |
| R-COM-10 | Every page answers HTTP 200 when requested directly. | #12 |

## Login (`/`)

| ID | Requirement | Test |
| --- | --- | --- |
| R-LOGIN-4 | A valid user with `secret_sauce` opens `/inventory.html`. | journey |

## Inventory (`/inventory.html`)

| ID | Requirement | Test |
| --- | --- | --- |
| R-INV-3 | Backpack $29.99, Bike Light $9.99, Bolt T-Shirt $15.99, Fleece Jacket $49.99, Onesie $7.99, Test.allTheThings() T-Shirt (Red) $15.99; ids 0–5. | — |
| R-INV-4 | Each product shows its own image. | #6 |
| R-INV-6 | The default order is Name A–Z. | #5 |
| R-INV-7 | Name Z–A reverses it. | #5 |
| R-INV-8 | Price low–high sorts by price, ascending. | #5 |
| R-INV-9 | Price high–low sorts by price, descending. | #5 |
| R-INV-10 | The sort box shows the chosen option. | #5 |
| R-INV-11 | "Add to cart" adds the item, shows "Remove" and raises the badge. | journey; #8 |
| R-INV-12 | "Remove" removes it, shows "Add to cart" and lowers the badge. | #7 |
| R-INV-13 | All six products can be added. | #8 |
| R-INV-14 | A product's name or image opens its own details page. | #9 |

## Product details (`/inventory-item.html?id=N`)

| ID | Requirement | Test |
| --- | --- | --- |
| R-ITEM-1 | Ids 0–5 show that product as on the inventory. | #9 |
| R-ITEM-2 | "Back to products" opens `/inventory.html`. | — |
| R-ITEM-6 | An unknown id shows no product and nothing to add. | #11 |

## Cart (`/cart.html`)

| ID | Requirement | Test |
| --- | --- | --- |
| R-CART-2 | Every item is listed with quantity 1, name, description, price and "Remove", in the order added. | journey |
| R-CART-5 | "Checkout" opens `/checkout-step-one.html`. | journey |

## Checkout: Your Information (`/checkout-step-one.html`)

| ID | Requirement | Test |
| --- | --- | --- |
| R-CO1-8 | Each field keeps exactly what was typed. | journey (#1) |
| R-CO1-9 | All three filled, Continue opens the overview. | journey |

## Checkout: Overview (`/checkout-step-two.html`)

| ID | Requirement | Test |
| --- | --- | --- |
| R-CO2-2 | Every cart item is listed with quantity 1, name, description and price. | journey |
| R-CO2-6 | Item total is the sum of the prices. | journey (#2) |
| R-CO2-7 | Tax is 8 % of it, rounded to the cent. | journey (#2) |
| R-CO2-8 | Total is item total plus tax. | journey (#2) |
| R-CO2-10 | Finish opens the confirmation and empties the cart. | journey (#3) |
| R-CO2-11 | With an empty cart the overview does not open by its URL. | #4 |

## Checkout: Complete (`/checkout-complete.html`)

| ID | Requirement | Test |
| --- | --- | --- |
| R-DONE-2 | The heading reads "Thank you for your order!". | journey |
| R-DONE-5 | No cart badge. | journey (#3) |
| R-DONE-7 | After Finish, "Generate PDF order" downloads the receipt; not when opened by URL. | journey |
| R-DONE-8 | Without an order the confirmation does not open by its URL. | #4 |
| R-DONE-9 | The order receipt PDF identifies the order: an order number or id the customer can quote, next to the date, the shipping details and the items. | #13, the LLM judge (ADR 0019, 0020) |
| R-DONE-10 | Page 1 of the order receipt PDF reads as a document: its content fits the page, no text is cut off or overlaps other text, and the shop's logo (the "Swag Labs" wordmark) heads it. | the LLM judge (ADR 0020) |
| R-DONE-11 | From the order receipt PDF alone the seller and the order can be told: the shop's name with a way to contact it (an address, e-mail or phone number), and what was bought. | #15, the LLM judge (ADR 0020) |

## Seen, not filed

- The item total is not rounded for some carts: Bike Light + Fleece Jacket
  shows "$59.980000000000004".
- After Reset App State the inventory shows "Remove" until a reload.
- For `problem_user`, About in the menu links to `https://saucelabs.com/error/404`.
