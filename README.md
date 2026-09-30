# Kalshi Touchdown Button

A live-trading companion for watching games with friends. Paste a Kalshi
game market URL, it buys 5 shares of each outcome (two for a straight
win/lose matchup, three when a draw/tie is a separate tradable market, like
soccer), and then a single button per outcome lets you sell every other
outcome's shares the instant it's decided — with a Buy Back option to
rebuild a position once the price falls.

**This places real orders with real money on your Kalshi account.** Read
"Security model" below before pasting real credentials into it.

## Architecture

This is a static, backend-free app by design:

- `web/` — React + TypeScript + Vite + Tailwind. All UI and game logic lives
  here, including request signing: parsing which team is which, tracking
  game state, polling prices/positions, computing P&L estimates, and signing
  every Kalshi API call with your private key using the browser's WebCrypto
  API.
- `relay/` — A single Cloudflare Worker, `relay/worker.js`. It holds **no
  credentials at all**. Its only job is working around the fact that
  browsers enforce CORS and Kalshi's API doesn't allowlist the custom
  `KALSHI-ACCESS-*` headers this app has to send — confirmed by testing a
  real CORS preflight against Kalshi's API. The worker forwards your
  already-signed request to the real Kalshi API and relays the response
  back with permissive CORS headers. It's restricted to the two real Kalshi
  hosts and to one browser origin, so it isn't an open proxy.

There is no server component and no database.

## Security model — read this before pasting a real key in

You paste your Kalshi Key ID and private key into the app's "Lock key"
screen. Here's exactly what that does and doesn't protect:

- The private key is imported into the browser's WebCrypto API as a
  **non-extractable** `CryptoKey`, then stored in that form in IndexedDB.
  After you paste it once, no JavaScript on the page — including this app's
  own code — can ever read the raw key bytes back out. Only the browser's
  internal sign operation can use it.
- That key lives **only in that one browser, on that one device**, and stays
  there (IndexedDB survives reloads and restarts) until you hit "Unlock /
  change key."
- **What this does not protect against:** anyone with access to that browser
  profile or device can place trades as you, for as long as the key is
  locked in. So can any malicious script that ever successfully runs on this
  page (a compromised dependency, a browser extension with page access, an
  XSS bug) — it can call the sign operation itself and forge requests, even
  though it can't read the key out directly. This is a materially higher-risk
  posture than keeping the key server-side, where no browser context ever
  touches it at all.
- Don't lock a real (production) key into a shared, public, or otherwise
  untrusted computer. Prefer the `demo` environment while testing.

If you'd rather not accept that trade-off, the safer alternative is a small
serverless function (e.g. a Cloudflare Worker with the key as an encrypted
secret) that does the signing instead of the browser — ask if you want that
version instead.

## Setup

### 1. Get a Kalshi API key

In the Kalshi UI (demo or production): **Account & security → API Keys →
Create Key**. Save the **Key ID** and download the **private key PEM file**
(Kalshi will not show it to you again).

### 2. Deploy the CORS relay (one-time)

The relay holds no secrets, so this is infrastructure you set up once and
forget about.

**Easiest — paste into the Cloudflare dashboard:**

1. Create a free Cloudflare account, go to **Workers & Pages → Create →
   Create Worker**.
2. Paste the contents of `relay/worker.js` into the editor, replacing the
   default code.
3. Under **Settings → Variables**, add `ALLOWED_ORIGIN` = the origin you'll
   run the frontend from (e.g. `http://localhost:5173` for local dev, or
   your GitHub Pages origin once deployed — see below).
4. Deploy. Note the worker's URL (`https://<name>.<subdomain>.workers.dev`).

**Or via the CLI**, if you'd rather script it:

```bash
cd relay
npx wrangler login
npx wrangler deploy
npx wrangler secret list # (nothing to add — no secrets used)
```

Edit `relay/wrangler.toml`'s `ALLOWED_ORIGIN` first.

### 3. Configure and run the frontend

```bash
cd web
npm install
```

Create `web/.env.local`:

```
VITE_RELAY_URL=https://<your-worker>.<subdomain>.workers.dev
```

```bash
npm run dev
```

Open `http://localhost:5173`, and on the "Lock key" screen paste your Key ID
and private key PEM. Pick `demo` first.

### 4. Try it on `demo` first

Fund your demo account with play money in the Kalshi UI and run through a
full game (start → touchdown → buy back) before ever locking in a
production key.

## Deploying to GitHub Pages

1. Repo **Settings → Pages → Source → GitHub Actions**. The workflow at
   `.github/workflows/deploy-pages.yml` builds `web/` and deploys it on every
   push to `master`.
2. That workflow needs one repository **variable**: **Settings → Secrets and
   variables → Actions → Variables → New repository variable**, name
   `RELAY_URL`, value your Worker's URL from step 2 above. (Not a secret —
   it's just a URL, and the worker holds no credentials.)
3. Update the relay's `ALLOWED_ORIGIN` to your Pages origin,
   `https://<you>.github.io` (no path, no trailing slash), and redeploy the
   worker.
4. Push to `master` (or run the workflow manually from the Actions tab). The
   frontend deploys to `https://<you>.github.io/<repo-name>/`.

Your key is never part of this deploy — it's pasted into the running app in
your browser, separately, per device.

## How the trading actually works

Kalshi's API doesn't have a distinct "market order" type — every order is a
limit order with a time-in-force, priced a couple cents through the best
opposing price to make it marketable. This app uses two different
time-in-force settings depending on how time-sensitive the action is:

- **Touchdown (selling every other outcome)** uses **IOC (immediate-or-cancel)**.
  Whatever doesn't fill immediately is cancelled outright, never left open —
  this is the one action that's supposed to be instant and final, so an
  unfilled remainder quietly resting on the book for hours (or filling after
  the game's already over) would be worse than just knowing it didn't fully
  go through.
- **Buy-in and Buy Back** use **good-till-canceled**, with no expiration.
  Whatever doesn't fill immediately **rests on the book** and may fill later,
  unattended, at a price you never explicitly saw — the trade-off accepted
  here is that these two aren't as time-critical as the touchdown sell, and
  resting can catch a fill IOC would've missed. The activity log distinguishes
  a full fill from "still resting" from an actual failure; the app's regular
  position polling will eventually pick up a late fill, but there's currently
  no in-app way to cancel a resting order — do that from Kalshi directly if
  you want to pull it back.

Either way, the order response tells you exactly how many contracts filled
before you see any UI update, so:

- After every order, the app re-fetches your actual position from Kalshi
  rather than assuming the order did what was requested.
- A second click on the same button while one is already in flight is
  rejected in-browser (one in-flight order per market ticker at a time), on
  top of the button disabling itself immediately in the UI.

Realized P&L, fees paid, and average cost basis for currently-held shares are
read directly from Kalshi's own position data, not recomputed locally — the
one exception is the pre-trade Buy Back fee estimate, which uses Kalshi's
published taker-fee formula and is labeled as an estimate; the exact fee
always comes back with the fill.

## Known limitations / things to sanity-check before real money

- **URL parsing is heuristic.** It extracts ticker-shaped tokens from the
  pasted URL and tries each one against Kalshi's API until one resolves to
  an event with two binary team markets. If Kalshi changes its URL format
  and this stops working, the fix is in `web/src/kalshi/parseKalshiUrl.ts`
  — or just paste the raw ticker instead of the full URL.
- **Price ticks are assumed to be whole cents.** That's true for the vast
  majority of Kalshi sports markets; a market with a different tick size
  could reject an order, which will show up as a clear error rather than a
  silent failure.
- **Ed25519 keys** depend on browser support for `crypto.subtle` Ed25519
  (widely available in current Chrome/Firefox/Safari, not universal on older
  browsers). RSA keys work everywhere WebCrypto exists.
- **Flat-fee series** aren't covered by the Buy Back fee estimate (Kalshi
  publishes that table separately); the estimate is hidden in that case and
  the real fee still shows up after the fill.
- Ending a session (the "End session" button) only stops this app from
  tracking the game locally — it does **not** sell any open positions. Close
  positions from the Kalshi app/site directly if you want to fully exit.

## Project layout

```
relay/
  worker.js              secret-free CORS passthrough to Kalshi's API
  wrangler.toml           Cloudflare Worker config (set ALLOWED_ORIGIN here)

web/src/
  kalshi/signing.ts        PEM parsing + WebCrypto RSA-PSS/Ed25519 signing
  kalshi/keyStore.ts        IndexedDB storage of the non-extractable key
  kalshi/client.ts           request building, resolve/order/position logic
  kalshi/pricing.ts           marketable IOC price math
  kalshi/orderLock.ts          per-ticker duplicate-order guard
  kalshi/parseKalshiUrl.ts      URL -> candidate ticker extraction
  state/useGame.ts        game state, polling, order-triggering actions
  components/             CredentialsSetup, SetupScreen, GameScreen, TeamPanel, ActivityLog
  lib/pnl.ts, format.ts    P&L/fee math and display formatting
```
