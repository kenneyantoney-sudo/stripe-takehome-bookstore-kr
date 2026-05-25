# Stripe Press Bookstore Demo

A simple e-commerce demo built with Node.js, Express, Handlebars, and Stripe Payment Element.

The application allows a user to select a book, complete payment using Stripe Elements, and view a confirmation page that displays both the final charged amount and the Stripe Payment Intent ID.

## 1. Build, Configure, and Run

### Prerequisites

- Node.js 18 or later
- npm
- Stripe test API keys

### Setup

1. Clone the repository.

```bash
git clone https://github.com/kenneyantoney-sudo/stripe-takehome-bookstore-kr.git
cd stripe-takehome-bookstore
```

If you are reviewing this submission from a zip file instead of GitHub, extract the archive and `cd stripe-takehome-bookstore`.

2. Install dependencies.

```bash
npm install
```

3. Create a local environment file.

```bash
cp sample.env .env
```

4. Add your Stripe test keys to `.env`.

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

5. Start the server.

```bash
npm start
```

6. Open the app locally.

```text
http://localhost:3000
```

### Test Card

Use Stripe's standard test card:

- Card number: `4242 4242 4242 4242`
- Expiration date: any future date
- CVC: any 3 digits
- ZIP/postal code: any valid value

Useful additional test cases:

- Declined card: `4000 0000 0000 0002`
- 3DS authentication flow: `4000 0025 0000 3155`

Stripe testing documentation:
https://docs.stripe.com/testing

## 2. How the Solution Works

### End-to-End Payment Flow

1. The user lands on the home page and selects one of the available books.
2. The browser navigates to `/checkout?item=<id>`.
3. The server looks up the selected item from the server-side catalog and renders the checkout page.
4. The checkout page loads Stripe.js from `https://js.stripe.com`.
5. The browser sends `POST /create-payment-intent` with the selected item ID.
6. The server looks up the correct amount for that item and creates a Stripe PaymentIntent.
7. The server returns the PaymentIntent `client_secret` to the browser.
8. The browser initializes Stripe Elements and mounts the Payment Element.
9. The customer enters payment details into Stripe's hosted iframe UI.
10. The browser calls `stripe.confirmPayment(...)`.
11. Stripe redirects the customer to `/success?payment_intent=pi_...`.
12. The server retrieves the PaymentIntent from Stripe and renders the confirmation page with the final amount and Payment Intent ID.

### Stripe APIs and SDK Features Used

`stripe.paymentIntents.create(...)`
- Creates the PaymentIntent on the server after the customer selects a book.
- Docs: https://docs.stripe.com/api/payment_intents/create

`stripe.paymentIntents.retrieve(...)`
- Retrieves the PaymentIntent on the success page so the server can render payment details from Stripe as the source of truth.
- Docs: https://docs.stripe.com/api/payment_intents/retrieve

Stripe.js and the Payment Element
- Securely collect payment details in the browser without card data passing through the server.
- Docs: https://docs.stripe.com/payments/accept-a-payment?platform=web&ui=elements

`stripe.confirmPayment(...)`
- Confirms the payment client-side and handles any required next actions such as 3DS authentication.
- Docs: https://docs.stripe.com/js/payment_intents/confirm_payment

### Architecture Overview

This project uses a small server-rendered architecture:

- `app.js`
  - Express application setup
  - server-side product catalog
  - checkout route
  - PaymentIntent creation route
  - success route

- `views/`
  - Handlebars templates for the storefront, checkout page, and confirmation page

- `public/js/checkout.js`
  - client-side Stripe integration
  - fetches the PaymentIntent client secret
  - mounts the Payment Element
  - confirms the payment

- `public/js/custom.js`
  - formats prices from cents into display dollars

### Security Decisions

- The Stripe secret key is used only on the server.
- The browser sends only the selected item ID, never a price or amount.
- The server performs the amount lookup before creating the PaymentIntent.
- The server generates a checkout session ID and reuses it as the Stripe idempotency key for PaymentIntent creation retries.
- In a production system, I would keep that idempotency key fully server-side and tie it to a durable cart or order record rather than round-tripping it through the client.
- Card details are collected by Stripe Elements and do not pass through the application server.
- The success page retrieves the PaymentIntent from Stripe before rendering the confirmation details.

Stripe key safety documentation:
https://docs.stripe.com/keys#safe-keys

## 3. Approach, Docs Used, and Challenges

### Approach

My goal was to keep the project small, readable, and easy to extend in a follow-up live interview.

I kept the original Express and Handlebars structure instead of introducing a larger framework because the assignment is centered on the payment flow rather than frontend complexity. That made the request path from product selection to payment confirmation easy to follow.

I also kept the catalog in a small server-side in-memory object instead of adding a database. For a take-home project, that keeps the demo focused while still preserving the important security property that the charged amount is determined on the server.

This project started from the provided Node.js boilerplate by Matt Mitchell and was then extended with the Stripe integration and related improvements described in this document.

### Documentation Used

- Accept a payment with Elements:
  https://docs.stripe.com/payments/accept-a-payment?platform=web&ui=elements

- PaymentIntents API:
  https://docs.stripe.com/api/payment_intents

- Stripe.js reference:
  https://docs.stripe.com/js

- API key safety:
  https://docs.stripe.com/keys

- Testing:
  https://docs.stripe.com/testing

### Challenges and Trade-offs

The main technical constraint was using Stripe Elements rather than Stripe Checkout. That meant handling the PaymentIntent lifecycle directly and keeping the browser and server responsibilities clearly separated.

Another trade-off was deciding how much architecture to add for a small assignment. I intentionally did not introduce a database, background worker, or additional service layers because that would add complexity without improving the core payment demonstration.

I also wanted the confirmation page to rely on Stripe as the source of truth, so the success route retrieves the PaymentIntent directly from Stripe instead of rendering values only from query parameters or browser state.

## 4. How I Would Extend This for a More Robust Production Build

If I were building this beyond a demo, especially in an AWS-oriented environment, I would extend it in the following ways:

1. Add a persistent data layer.
   - Move products, prices, and orders into DynamoDB or Aurora so inventory, order history, and reconciliation are durable.

2. Add production-grade event handling for fulfillment.
   - In a typical Stripe integration, webhook-driven fulfillment is the standard pattern because payment results are asynchronous.
   - The browser redirect is useful for customer UX, but it is not reliable enough to drive fulfillment on its own because the customer can close the tab, lose connectivity, or return before downstream systems are updated.
   - Docs: https://docs.stripe.com/webhooks?lang=node

3. In AWS, use Stripe's Amazon EventBridge destination for event ingestion.
   - Rather than managing a public webhook endpoint directly, I would send Stripe events into Amazon EventBridge and route them to Lambda, SQS, Step Functions, or downstream services.
   - This is a better fit for an event-driven AWS architecture and makes fan-out, routing, and downstream processing cleaner.
   - Stripe EventBridge docs: https://docs.stripe.com/event-destinations/eventbridge?locale=en-GB
   - AWS EventBridge docs: https://docs.aws.amazon.com/eventbridge/

4. Attach internal order and customer metadata.
   - I would associate internal order IDs and customer context with the PaymentIntent so fulfillment and support tooling can correlate Stripe objects with application records.

5. Improve payment-state handling.
   - I would explicitly handle `processing`, `requires_payment_method`, `canceled`, and other PaymentIntent states in both the UI and backend fulfillment flow.

6. Add operational hardening.
   - I would add structured logging, environment validation, monitoring, integration tests, and a more durable idempotency strategy.

7. Refactor the application into modules.
   - I would split routes, Stripe service logic, catalog logic, and configuration into separate files so future feature work is safer and easier to demonstrate live.

## 5. Summary

This project implements a bookstore purchase flow using Stripe Payment Element rather than Stripe Checkout. The amount is determined server-side, payment details are collected securely through Stripe Elements, and the confirmation page displays both the charged amount and the Stripe Payment Intent ID.

I optimized for clarity, correct use of Stripe's recommended Elements-based payment flow, and a structure that can be extended later with stronger AWS-native event processing patterns.
