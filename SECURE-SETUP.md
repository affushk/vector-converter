# Vectryz Secure Access Setup

This repo now includes a secure Free / Pro / Owner access system for `public/vectryz-v69-secure.html`.

## What is included
- Email/password registration and login
- Password hashing with Node crypto scrypt
- Signed session tokens
- Free / Pro / Owner roles
- Server-side Pro expiry
- Owner-only Pro grants
- Razorpay order creation
- Razorpay signature verification
- Server-side order/account binding
- Payment capture before Pro activation
- 2K free export gate and Pro 4K/6K + Photoshop export gate

## Required environment variables
Copy values from `.env.example` into your hosting provider's environment settings.

- `OWNER_EMAIL` — the email that should always receive Owner access.
- `SESSION_SECRET` — a long random secret. Never put it in public HTML.
- `RAZORPAY_KEY_ID` — Razorpay key ID.
- `RAZORPAY_KEY_SECRET` — Razorpay secret. Never expose it in frontend code.
- `PRO_PRICE_PAISE` — default `19900` = ₹199.
- `PRO_DAYS` — default `30`.
- `DATA_FILE` — optional path for persistent user/payment data.

## Important hosting note
RawGitHack only serves static files. It cannot execute `server.js`, so real login/payment must be hosted on a Node.js server.

The host must support:
1. Node.js 18+
2. Environment variables
3. Persistent storage for `DATA_FILE` (or replace file storage with a database)

Start command:
`npm start`

After deployment, open:
`/secure`

## Safe launch order
1. Deploy with Razorpay TEST keys first.
2. Register the email configured in `OWNER_EMAIL`.
3. Confirm that account shows OWNER.
4. Register a second test account.
5. Make a Razorpay test payment and confirm PRO expiry appears.
6. Only then switch to live Razorpay keys.


## Vectorizer.AI official API
The secure page now supports the official Vectorizer.AI API through the Node backend.

Set these environment variables on the Node host:
- `VECTORIZER_API_ID`
- `VECTORIZER_API_SECRET`
- `VECTORIZER_MODE=test` while integrating

Use `test` first. Test results are watermarked but do not consume production credits. After quality and workflow are confirmed, switch to `production`. In production mode, this app only allows Pro or Owner accounts to call the paid engine.

Never put the API Secret in HTML, frontend JavaScript, GitHub Pages variables exposed to the browser, or a public repository.
