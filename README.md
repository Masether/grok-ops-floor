# Grok Ops Floor

Multi-agent Kraken trading desk. Paper by default. Live only after you paste keys and arm.

Twelve desks read the Kraken tape, size tickets, journal fills, and watch news that moves names on the book.

## What it does

- **Paper / demo** — live Kraken 1-minute prices, fake cash. Auto-trade on.
- **Live** — real market orders after **Test connection → Live → Arm**. Withdrawal permission is never required and should stay off.
- **Core / Heat / xStocks** — BTC-ETH-SOL plus rising memes (PEPE, WIF, BONK…) and Kraken tokenized names (NVDAx, TSLAx, AAPL, SPY). Heat only if the tape is actually rising.
- **Self-learning brain** — adjusts RSI bands, confidence, size, and pair bias from closed trades.
- **The Wire** — headlines, org catalysts (MicroStrategy, BlackRock, Fed, NVIDIA…), CoinGecko trending, Fear & Greed. Hunter uses that to rank the book.

This is not a promise to multiply capital. Memes can go to zero. Live can lose real USD.

## Run it

```bash
git clone https://github.com/Masether/grok-ops-floor.git
cd grok-ops-floor
npm install
npm run dev
```

Open the printed local URL. Floor starts in **paper**.

### Paper rehearsal

1. Leave **Paper** on, **Auto-trade** on.
2. Hit **Scan live tape** — real RSI/EMA/MACD on Kraken 1m candles.
3. Watch The Wire and the orbit. Fills say `PAPER FILL`. No Kraken cash moves.

### Live (your account)

1. Deposit USD on Kraken (Funding → deposit). The bot cannot deposit or withdraw.
2. API key: **Query + Create & Modify Orders**. Leave **Withdrawal** off.
3. Settings → paste key + private key → **Test connection**.
4. Switch **Live Kraken** → **Arm live**. Kill switch is the power button.

Kraken keys stay in this browser (`localStorage`). They are not in the repo.

## Stack

TanStack Start · Vite · React 19 · Zustand · Kraken REST + WebSocket v2.

## Safety

- Paper is default.
- Live blocked until keys test OK and you arm.
- Daily-loss halt, stops, max positions, 2-meme cap, cooldown.
- Public rate limits: ticker WebSocket, OHLC only on the hottest names each cycle.

## License

Private project for Masether. Not financial advice.
