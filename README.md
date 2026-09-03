# ShellOut Bot

Live Kraken desk. **$200 USD budget**. Scalp + grid + DCA together. Profits can sweep back to Kraken USD.

The bot only trades while the tab is **awake**. Lid closed = no tickets.

## On your laptop

Repo: **https://github.com/Masether/grok-ops-floor**

```bash
git clone https://github.com/Masether/grok-ops-floor.git
cd grok-ops-floor
npm install
npm run dev
```

Open the URL Vite prints. Keys stay in that browser. Do **not** put a withdrawal key on the API.

## Arm live ($200)

1. Kraken: deposit USD (Funding → Deposit → USD).
2. API key: **Query + Create & Modify Orders**. Leave **Withdraw** off.
3. ShellOut Bot → Settings → paste keys → **Test connection**.
4. Auto-scan every 5s. **Scan tape** is the manual poke.
5. Kill switch is the power button.

Tickets size from **$12 min** to **$100 max**, using the rest of the $200 so cash does not sit idle. Daily-loss halt and Kraken fees are in every ticket.

Not financial advice. Live money can go to zero.
