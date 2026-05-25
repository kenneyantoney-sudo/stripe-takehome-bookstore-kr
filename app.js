const express = require('express');
const path = require('path');
const crypto = require('crypto');
const exphbs = require('express-handlebars');
require('dotenv').config();

// Server-side Stripe client. Secret key loaded from .env via dotenv.
// Per Stripe's recommendation, the secret key never leaves the server:
// https://docs.stripe.com/keys#safe-keys
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Hardcoded catalog so we don't drag in a DB for a take-home. Both /checkout
// and /create-payment-intent read from this so prices can't drift between
// what the user sees and what we charge.
const BOOKS = {
  '1': {
    title: 'The Art of Doing Science and Engineering',
    author: 'Richard Hamming',
    description: 'The Art of Doing Science and Engineering is a reminder that a childlike capacity for learning and creativity are accessible to everyone.',
    image: '/images/art-science-eng.jpg',
    imageAlt: 'The Art of Doing Science and Engineering cover',
    amount: 2300
  },
  '2': {
    title: 'The Making of Prince of Persia: Journals 1985-1993',
    author: 'Jordan Mechner',
    description: "In The Making of Prince of Persia, on the 30th anniversary of the game's release, Mechner looks back at the journals he kept from 1985 to 1993.",
    image: '/images/prince-of-persia.jpg',
    imageAlt: 'The Making of Prince of Persia cover',
    amount: 2500
  },
  '3': {
    title: 'Working in Public: The Making and Maintenance of Open Source',
    author: 'Nadia Eghbal',
    description: 'Nadia Eghbal takes an inside look at modern open source and offers a model through which to understand the challenges faced by online creators.',
    image: '/images/working-in-public.jpg',
    imageAlt: 'Working in Public cover',
    amount: 2800
  }
};

const app = express();

// Handlebars setup
app.engine('hbs', exphbs({ defaultLayout: 'main', extname: '.hbs' }));
app.set('view engine', 'hbs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Home page. Render the catalog from the same server-side source used for
// checkout and charging so the UI cannot drift from the payment logic.
app.get('/', (req, res) => {
  const books = Object.entries(BOOKS).map(([id, book]) => ({
    id,
    ...book
  }));

  res.render('index', { books });
});

// Checkout page. Looks up the selected book and renders the Payment Element.
// We pass the publishable key here so client-side Stripe.js can initialize:
// https://docs.stripe.com/keys
app.get('/checkout', (req, res) => {
  const book = BOOKS[req.query.item];

  if (!book) {
    return res.render('checkout', { error: 'No item selected' });
  }

  // Stripe recommends creating one PaymentIntent per order or customer
  // session. For this demo, I generate a checkout session ID here and reuse it
  // as the idempotency key if the browser retries PaymentIntent creation:
  // https://docs.stripe.com/api/payment_intents
  const checkoutSessionId = crypto.randomUUID();

  res.render('checkout', {
    title: book.title,
    amount: book.amount,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    checkoutSessionId
  });
});

// Create PaymentIntent. The browser sends the item ID and the server looks up
// the price. I never trust client-supplied amounts. This route returns the
// client_secret the browser needs to mount the Payment Element.
//
// The idempotency key protects against duplicate charges if the request is
// retried (double-click, network retry, etc). Stripe replays the original
// response for 24h: https://docs.stripe.com/api/idempotent_requests
//
// Reference: https://docs.stripe.com/api/payment_intents/create
app.post('/create-payment-intent', async (req, res) => {
  const { item, checkoutSessionId } = req.body;
  const book = BOOKS[item];

  if (!book) {
    return res.status(400).json({ error: 'Invalid item' });
  }

  if (!checkoutSessionId) {
    return res.status(400).json({ error: 'Missing checkout session ID' });
  }

  try {
    const idempotencyKey = `checkout_${checkoutSessionId}`;

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: book.amount,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          item,
          checkoutSessionId
        }
      },
      { idempotencyKey }
    );

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('PaymentIntent create failed:', err.message);
    res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
});

// Confirmation page. Stripe redirects here after confirmPayment() with
// ?payment_intent=pi_xxx in the query. I retrieve the PaymentIntent from
// Stripe (the source of truth — never trust the URL alone) and render the
// receipt: https://docs.stripe.com/api/payment_intents/retrieve
//
// Note: in production, order fulfillment should be driven by the
// payment_intent.succeeded webhook or an AWS EventBridge integration, not this
// redirect. The redirect is for UX; the webhook or event destination is the
// trusted async signal.
app.get('/success', async (req, res) => {
  const paymentIntentId = req.query.payment_intent;

  if (!paymentIntentId) {
    return res.render('success', {});
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Only a succeeded PaymentIntent should render as a completed purchase.
    // Other states should show a status-aware message instead of a false
    // success page.
    res.render('success', {
      amount: paymentIntent.amount,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      isSuccess: paymentIntent.status === 'succeeded'
    });
  } catch (err) {
    console.error('PaymentIntent retrieve failed:', err.message);
    res.render('success', { error: 'Could not load payment details.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
