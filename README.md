# Kalshi Touchdown Button

A live-trading companion for watching football with friends. Paste a Kalshi
game market URL, it buys 10 shares of each team, and then a single button
per team lets you sell the losing team's shares the instant a touchdown is
scored — with a Buy Back option to rebuild the position once the price falls.

**This places real orders with real money on your Kalshi account.** Read the
Safety notes below before using it during an actual game.

## Architecture

- `web/` — React + TypeScript + Vite + Tailwind. Nearly all UI and game logic
  lives here: parsing which team is which, tracking game state, polling
  prices/positions, computing P&L estimates.
- `server/` — A minimal Express + TypeScript API. It exists only because
  Kalshi's API requires a private key to sign every request, which can never
  be shipped to a browser. It does exactly four things: resolve a pasted URL
  into a market pair, fetch live prices, fetch positions, and place orders.
  It holds no other state and has no database or user accounts.

The frontend never sees your Kalshi API key or private key — every
authenticated call is proxied through the backend.

## Setup

### 1. Get a Kalshi API key

In the Kalshi UI (demo or production): **Account & security → API Keys →
Create Key**. Save the **Key ID** and download the **private key PEM file**
somewhere outside this repo (Kalshi will not show it to you again).

### 2. Configure the backend

```bash
cd server
cp .env.example .env
```

Edit `.env`:

- `KALSHI_ENV` — `demo` to practice with play money, `prod` for real money.
- `KALSHI_API_KEY_ID` — the Key ID from step 1.
- `KALSHI_PRIVATE_KEY_PATH` — absolute path to the PEM file (use forward
  slashes even on Windows, e.g. `C:/secure/kalshi-key.pem`).
- `SLIPPAGE_BUFFER_CENTS` — how many cents through the best bid/ask the app
  is willing to pay/accept to guarantee a fast fill on Touchdown/Buy Back
  (default 2¢). Raise it on a thin/illiquid market, lower it if you'd rather
  risk a partial fill than pay extra slippage.

**Never commit `.env` or the PEM file.** Both are already gitignored.

### 3. Install and run

From the repo root:

```bash
npm install
npm run dev
```

This starts the backend on `:8787` and the frontend on `:5173` (Vite proxies
`/api/*` to the backend in dev). Open `http://localhost:5173`.

### 4. Try it on `demo` first

Set `KALSHI_ENV=demo`, fund your demo account with play money in the Kalshi
UI, and run through a full game (start → touchdown → buy back) before ever
pointing this at `prod`.

## Deploying

**GitHub Pages cannot host your Kalshi API key.** Pages only serves static
files — anything that ends up there is public to anyone with the URL, with
no server to run code or keep a secret. That's exactly the property the
`server/` backend exists to avoid: the private key has to live somewhere
that (a) executes code and (b) has real secret storage, neither of which
Pages provides. So the deployment is necessarily two pieces:

- **Frontend → GitHub Pages** (or Vercel/Netlify — Pages is fine here since
  it's just static files).
- **Backend → a small host that runs Node with secrets** — Render, Fly.io,
  Railway, a cheap VPS, or even your own machine on your LAN during the game
  all work. Free tiers of Render/Fly/Railway are plenty for this.

### 1. Deploy the backend somewhere first

Pick a host (Render is the least fiddly for a single small service):

1. Push this repo (already done if you're reading this after the commit).
2. Create a new Web Service pointing at it, root directory `server`, build
   command `npm install && npm run build`, start command `npm start`.
3. In that host's dashboard (**not** in the repo), set the environment
   variables from `server/.env.example`: `KALSHI_ENV`, `KALSHI_API_KEY_ID`,
   `KALSHI_PRIVATE_KEY` (paste the PEM contents directly here, with real
   newlines — most hosts' env var UIs handle multi-line values fine; use
   `KALSHI_PRIVATE_KEY_PATH` instead only if the host gives you persistent
   file storage), `SLIPPAGE_BUFFER_CENTS`, and `WEB_ORIGIN` (set this to your
   Pages URL from step 2 below, e.g. `https://yourname.github.io`).
4. Note the public URL the host gives your service, e.g.
   `https://kalshi-button-api.onrender.com`.

### 2. Turn on GitHub Pages for this repo

In the repo on GitHub: **Settings → Pages → Source → GitHub Actions.** The
workflow at `.github/workflows/deploy-pages.yml` (already in this repo)
builds `web/` and deploys it on every push to `main`.

That workflow needs one repository **variable** (not secret — it's just a
public URL, no key involved): **Settings → Secrets and variables → Actions →
Variables → New repository variable**, name `API_BASE_URL`, value the
backend URL from step 1 (e.g. `https://kalshi-button-api.onrender.com`, no
trailing slash).

Push to `main` (or run the workflow manually from the Actions tab) and the
frontend deploys to `https://<your-username>.github.io/<repo-name>/`.

### 3. Close the loop

Go back to the backend host and make sure `WEB_ORIGIN` matches the Pages URL
exactly (e.g. `https://yourname.github.io`, not the `/repo-name/` subpath —
CORS checks the origin, not the full path). Restart the backend service if
the host doesn't do it automatically after an env var change.

From then on: edit code, push to `main`, the frontend redeploys automatically;
redeploy the backend from its host's dashboard (or push, if you wired up
auto-deploy there) whenever `server/` changes.

## How the trading actually works

Every order this app places is an **IOC (immediate-or-cancel)** order priced
a couple cents through the best opposing price — Kalshi's API doesn't have a
distinct "market order" type; this is the standard way to get a fill without
resting on the book. The response tells you exactly how many contracts
filled before you see any UI update, so:

- A "Touchdown" or "Buy Back" press either fills (in full or partially) or
  bounces — it never silently does nothing.
- After every order, the app re-fetches your actual position from Kalshi
  rather than assuming the order did what was requested. Partial fills are
  shown as a warning in the activity log with a "try again" nudge.
- A second click on the same button while one is already in flight is
  rejected by the backend (one in-flight order per market ticker at a time),
  on top of the button disabling itself immediately in the UI.

Realized P&L, fees paid, and average cost basis for currently-held shares are
read directly from Kalshi's own position data, not recomputed locally — the
one exception is the pre-trade Buy Back fee estimate, which uses Kalshi's
published taker-fee formula and is labeled as an estimate; the exact fee
always comes back with the fill.

## Known limitations / things to sanity-check before real money

- **URL parsing is heuristic.** It extracts ticker-shaped tokens from the
  pasted URL and tries each one against Kalshi's API until one resolves to
  an event with two binary team markets. If Kalshi changes its URL format
  and this stops working, the fix is in `server/src/lib/parseKalshiUrl.ts`
  — or just paste the raw ticker instead of the full URL.
- **Price ticks are assumed to be whole cents.** That's true for the vast
  majority of Kalshi sports markets; a market with a different tick size
  could reject an order, which will show up as a clear error rather than a
  silent failure.
- **Flat-fee series** aren't covered by the Buy Back fee estimate (Kalshi
  publishes that table separately); the estimate is hidden in that case and
  the real fee still shows up after the fill.
- Ending a session (the "End session" button) only stops this app from
  tracking the game locally — it does **not** sell any open positions. Close
  positions from the Kalshi app/site directly if you want to fully exit.

## Project layout

```
server/src/
  config.ts            env/config loading
  kalshi/signing.ts     RSA-PSS / Ed25519 request signing
  kalshi/client.ts       thin wrapper over the Kalshi REST API
  kalshi/types.ts        Kalshi API response shapes we use
  lib/parseKalshiUrl.ts  URL -> candidate ticker extraction
  lib/pricing.ts          marketable IOC price / fee math
  lib/orderLock.ts        per-ticker duplicate-order guard
  routes/                 resolve, markets, positions, orders endpoints

web/src/
  api/client.ts          fetch wrapper for the backend
  state/useGame.ts        game state, polling, order-triggering actions
  components/             SetupScreen, GameScreen, TeamPanel, ActivityLog
  lib/pnl.ts, format.ts    P&L/fee math and display formatting
```
