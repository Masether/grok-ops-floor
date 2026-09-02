# MaSether Ops Floor

Multi-agent Kraken trading desk. Paper by default. Live only after you paste keys and arm. Live spends **only your budget** (default **$200**).

Twelve desks read the Kraken tape, size tickets, journal fills, and watch news that moves names on the book.

## On your laptop

Repo: **https://github.com/Masether/grok-ops-floor**

```bash
git clone https://github.com/Masether/grok-ops-floor.git
cd grok-ops-floor
npm install
npm run dev
```

Then open the URL Vite prints (same machine, in Chrome or Edge). Install from the phone-icon next to kill if you want a Home Screen / desktop app.

Do **not** put a withdrawal key on the API. Keys stay in that browser.

## $200 live budget

The bot will not size tickets off your whole Kraken wallet. It only uses the **Live budget** (default $200 USDT/USD). Extra funds on Kraken stay untouched.

1. On Kraken: deposit **$200 USDT**.
2. Convert USDT → **USD** in Kraken (Funding → Convert). This book trades USD pairs (`BTC/USD`, …). USDT sitting idle cannot fill those orders.
3. API key: **Query + Create & Modify Orders**. Leave **Withdraw** off.
4. In the desk: **Live** → set budget **$200** → I'm human → paste keys → **Test connection** → **Arm live**.
5. Auto-trade on. Kill switch is the power button.

If Kraken USD is under ~$15 after convert, the runner waits. Daily-loss halt, stops, and max lots all apply to that $200 sleeve — not the rest of the account.

## What it does

- **Paper / demo** — live Kraken 1-minute prices, fake cash. Auto-trade on.
- **Live** — real market orders after **Test connection → Live → Arm**. Capped at your budget. Withdrawal permission is never required and should stay off.
- **Core / Heat / xStocks** — BTC-ETH-SOL plus rising memes and Kraken tokenized names. Heat only if the tape is actually rising.
- **Self-learning brain** — adjusts RSI bands, confidence, size, and pair bias from closed trades.
- **The Wire** — headlines, org catalysts, CoinGecko trending, Fear & Greed.

This is not a promise to multiply capital. Memes can go to zero. Live can lose the budget you set.

### Paper rehearsal

1. Leave **Paper** on, **Auto-trade** on.
2. Hit **Scan live tape** — real RSI/EMA/MACD on Kraken 1m candles.
3. Watch The Wire and the orbit. Fills say `PAPER FILL`. No Kraken cash moves.

### Live (your account)

1. Deposit USDT on Kraken, convert to USD. The bot cannot deposit or withdraw.
2. API key: **Query + Create & Modify Orders**. Leave **Withdrawal** off.
3. Settings → Live budget **$200** → paste key + private key → **Test connection**.
4. **Arm live**. Kill switch is the power button.

Kraken keys stay in this browser (`localStorage`). They are not in the repo.

## Stack

TanStack Start · Vite · React 19 · Zustand · Kraken REST + WebSocket v2.

## Safety

- Paper is default.
- Live blocked until keys test OK and you arm.
- Live size is capped at the budget you set (default $200).
- Daily-loss halt, stops, max positions, 2-meme cap, cooldown.
- Public rate limits: ticker WebSocket, OHLC only on the hottest names each cycle.

## License

Private project for Masether. Not financial advice.
