# ShellOut Bot

Live Kraken desk. **$200 USD budget**. Scalp + grid + DCA together.

Two ways to run it:

1. **Watch UI** — `npm run dev` — browser tab. Trades only while that tab is awake.
2. **Headless** — `npm run bot` — no window. Trades while **this process** stays up (laptop lid open with the process running, or a VPS).

## Headless (lid can be shut only if the process is on another machine)

Keys never go in git. Either:

```bash
export KRAKEN_API_KEY="your-query-orders-key"
export KRAKEN_API_SECRET="your-private-key"
export SHELLOUT_BUDGET=200
npm run bot
```

or write `.shellout-keys.json` (already gitignored):

```json
{ "apiKey": "…", "apiSecret": "…" }
```

Then:

```bash
npm run bot
```

Leave that terminal running. Journal is `.shellout-book.json`. Kill with Ctrl+C.

Do **not** put a withdrawal key on the API.

## Watch UI (laptop)

```bash
git clone https://github.com/Masether/grok-ops-floor.git
cd grok-ops-floor
npm install
npm run dev
```

Open the URL Vite prints. Same $12–$100 tickets, $200 sleeve.

Not financial advice. Live money can go to zero.
