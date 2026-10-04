# API Reference

All endpoints are available on both the Next.js server and the standalone Cloudflare Worker.

**Base URLs:**
- Development: `http://localhost:3000`
- Cloudflare Worker: `https://crypto-signal-scanner.workers.dev`

---

## Health Check

### `GET /api/health`

Returns the service status. No database required.

**Response:**
```json
{
  "ok": true,
  "status": "healthy",
  "service": "crypto-advanced-signal-scanner",
  "version": "1.0.0",
  "mode": "serverless-memory",
  "primaryProvider": "binance-public",
  "fallbackProvider": "coingecko",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

---

## Market Data

### `GET /api/market`

Returns 24-hour ticker and optional metadata for a symbol.

**Query Parameters:**

| Param    | Type   | Default    | Description          |
| :------- | :----- | :--------- | :------------------- |
| `symbol` | string | `BTCUSDT`  | Trading pair symbol  |

**Example:**
```
GET /api/market?symbol=ETHUSDT
```

**Response:**
```json
{
  "symbol": "ETHUSDT",
  "ticker": {
    "symbol": "ETHUSDT",
    "lastPrice": 2750.42,
    "priceChangePercent": 2.35,
    "highPrice": 2800.00,
    "lowPrice": 2680.00,
    "volume": 125000,
    "quoteVolume": 343750000
  },
  "metadata": {
    "id": "ethereum",
    "symbol": "ETHUSDT",
    "name": "Ethereum",
    "rank": 2,
    "source": "binance"
  },
  "timestamp": 1705312800000
}
```

---

## Full Analysis

### `GET /api/analyze`

Performs complete multi-timeframe Layer 3 analysis for a symbol.

**Query Parameters:**

| Param    | Type   | Default    | Description                            |
| :------- | :----- | :--------- | :------------------------------------- |
| `symbol` | string | `BTCUSDT`  | Trading pair symbol                    |
| `tf`     | string | `15m`      | Primary timeframe (`1m`,`5m`,`15m`,`1h`,`4h`,`1d`) |

**Example:**
```
GET /api/analyze?symbol=BTCUSDT&tf=15m
```

**Response:**
```json
{
  "symbol": "BTCUSDT",
  "timeframe": "15m",
  "ticker": { /* 24h ticker data */ },
  "metadata": { /* coin metadata */ },
  "signal": {
    "symbol": "BTCUSDT",
    "timeframe": "15m",
    "direction": "LONG",
    "score": 87,
    "classification": "VERY_STRONG",
    "currentPrice": 96500,
    "tradePlan": {
      "entry": {
        "min": 95800,
        "max": 96200,
        "optimal": 96000,
        "type": "FVG"
      },
      "stopLoss": 94800,
      "stopLossPercent": 1.76,
      "invalidationReason": "Candle close below structural swing low $94,800",
      "tp1": 98700,
      "tp1Percent": 2.28,
      "tp2": 101400,
      "tp2Percent": 5.08,
      "tp3": 106500,
      "tp3Percent": 10.36,
      "rrRatio": 1.5,
      "riskLevel": "MEDIUM"
    },
    "reasons": [
      "Sell-side liquidity sweep executed at $95,200 (SWING_LOW)",
      "Bullish Market Structure Shift (MSS/CHoCH) confirmed",
      "Higher Timeframe alignment bullish across 1D/4H/1H",
      "High-momentum displacement impulse detected",
      "Buyer volume dominance (+18% taker imbalance)"
    ],
    "warnings": [],
    "invalidation": "Candle close below structural swing low $94,800",
    "marketRegime": {
      "regime": "TRENDING_BULLISH",
      "atr": 450.0,
      "atrPercent": 0.47,
      "adx": 35,
      "bbWidth": 2.4,
      "description": "Consistent upward trend structure"
    },
    "components": {
      "liquidity": 85,
      "marketStructure": 90,
      "multiTimeframe": 88,
      "sessionLiquidity": 75,
      "volume": 80,
      "derivatives": 70,
      "advancedLayer3": 86
    },
    "layer3": { /* 3-layer breakdown */ },
    "dataTimestamp": 1705312800000,
    "analysisTimestamp": 1705312805000,
    "isStale": false
  },
  "liquidityLevels": [ /* array of liquidity levels */ ],
  "liquiditySweeps": [ /* array of detected sweeps */ ],
  "structure": { /* market structure summary */ },
  "sessionLiquidity": { /* session analysis */ },
  "volumeMetrics": { /* volume analysis */ },
  "derivatives": { /* derivatives data */ },
  "marketRegime": { /* regime classification */ },
  "mtf": { /* multi-timeframe analysis */ },
  "layer3": { /* layer 3 analysis */ },
  "candles": [ /* array of klines */ ],
  "dataTimestamp": 1705312800000,
  "analysisTimestamp": 1705312805000
}
```

---

## Signals

### `GET /api/signals`

Returns directional signals for multiple symbols.

**Query Parameters:**

| Param     | Type   | Default                   | Description                    |
| :-------- | :----- | :------------------------ | :----------------------------- |
| `symbols` | string | `BTCUSDT,ETHUSDT,SOLUSDT` | Comma-separated symbol list    |
| `tf`      | string | `15m`                     | Primary timeframe              |

**Example:**
```
GET /api/signals?symbols=BTCUSDT,ETHUSDT,SOLUSDT&tf=1h
```

**Response:**
```json
{
  "updatedAt": "2025-01-15T12:00:00.000Z",
  "timestamp": 1705312800000,
  "timeframe": "1h",
  "signals": [
    { /* Signal object for BTCUSDT */ },
    { /* Signal object for ETHUSDT */ },
    { /* Signal object for SOLUSDT */ }
  ]
}
```

---

## Scanner

### `GET /api/scanner`

Runs the full market scanner across a tier of symbols.

**Query Parameters:**

| Param     | Type   | Default  | Description                                   |
| :-------- | :----- | :------- | :-------------------------------------------- |
| `tier`    | string | `top10`  | `top10`, `top25`, `top50`                     |
| `tf`      | string | `15m`    | Primary timeframe                             |
| `symbols` | string | (none)   | Custom comma-separated list (overrides tier)  |

**Example:**
```
GET /api/scanner?tier=top10&tf=15m
GET /api/scanner?symbols=BTCUSDT,ETHUSDT,SOLUSDT&tf=1h
```

**Response:**
```json
{
  "updatedAt": "2025-01-15T12:01:00.000Z",
  "timestamp": 1705312860000,
  "totalScanned": 10,
  "timeframe": "15m",
  "signals": [
    {
      "symbol": "BTCUSDT",
      "timeframe": "15m",
      "direction": "LONG",
      "score": 87,
      "classification": "VERY_STRONG",
      "currentPrice": 96500,
      "tradePlan": { /* ... */ },
      "reasons": [ /* ... */ ],
      "warnings": [],
      "invalidation": "...",
      "marketRegime": { /* ... */ },
      "components": { /* ... */ },
      "layer3": { /* ... */ },
      "dataTimestamp": 1705312800000,
      "analysisTimestamp": 1705312860000,
      "isStale": false
    }
  ],
  "summary": {
    "longs": 3,
    "shorts": 1,
    "noSignal": 6,
    "strongOrBetter": 2
  }
}
```

---

## Liquidity

### `GET /api/liquidity`

Returns the liquidity map for a symbol.

**Query Parameters:**

| Param    | Type   | Default    | Description         |
| :------- | :----- | :--------- | :------------------ |
| `symbol` | string | `BTCUSDT`  | Trading pair symbol |
| `tf`     | string | `15m`      | Timeframe           |

**Response:**
```json
{
  "symbol": "BTCUSDT",
  "timeframe": "15m",
  "currentPrice": 96500,
  "totalLevels": 12,
  "levels": [
    {
      "price": 98200,
      "type": "EQUAL_HIGH",
      "strength": 92,
      "swept": false,
      "distancePercent": 1.76,
      "timestamp": 1705310000000
    }
  ],
  "sweeps": [
    {
      "type": "SELL_SIDE_SWEEP",
      "levelPrice": 95200,
      "levelType": "SWING_LOW",
      "sweepExtremePrice": 94800,
      "reclaimPrice": 95600,
      "penetrationPercent": 0.42,
      "wickToBodyRatio": 1.8,
      "volumeConfirmed": true
    }
  ],
  "timestamp": 1705312800000
}
```

---

## Structure

### `GET /api/structure`

Returns market structure events, FVGs, and order blocks.

**Query Parameters:**

| Param    | Type   | Default    | Description         |
| :------- | :----- | :--------- | :------------------ |
| `symbol` | string | `BTCUSDT`  | Trading pair symbol |
| `tf`     | string | `15m`      | Timeframe           |

**Response:**
```json
{
  "symbol": "BTCUSDT",
  "timeframe": "15m",
  "currentPrice": 96500,
  "structure": {
    "trend": "BULLISH",
    "lastEvent": { /* ... */ },
    "events": [ /* BOS, MSS, HH, HL, LH, LL events */ ],
    "swingHighs": [ /* confirmed swing highs */ ],
    "swingLows": [ /* confirmed swing lows */ ],
    "fvgs": [ /* Fair Value Gaps */ ],
    "orderBlocks": [ /* Order Blocks */ ],
    "displacementDetected": true,
    "recentMSS": { /* latest MSS event */ },
    "recentBOS": null
  },
  "timestamp": 1705312800000
}
```

---

## Derivatives

### `GET /api/derivatives`

Returns futures derivatives data enriched with price context.

**Query Parameters:**

| Param    | Type   | Default    | Description         |
| :------- | :----- | :--------- | :------------------ |
| `symbol` | string | `BTCUSDT`  | Trading pair symbol |

**Response:**
```json
{
  "symbol": "BTCUSDT",
  "openInterest": 15420,
  "openInterestValueUSD": 1464900000,
  "oiChange1hPercent": 1.25,
  "oiChange24hPercent": 4.8,
  "oiTrend": "LONG_BUILDUP",
  "fundingRate": 0.0001,
  "fundingRateAnnualizedPercent": 10.95,
  "fundingCategory": "NEUTRAL",
  "globalLongShortRatio": 1.15,
  "topTraderLongShortRatio": 1.20,
  "topTraderPositionRatio": 1.18,
  "positioning": "LONG_DOMINANT",
  "takerBuySellRatio": 1.08,
  "timestamp": 1705312800000
}
```

---

## Configuration

### `GET /api/config`

Returns engine configuration, scoring weights, and system parameters.

**Response:**
```json
{
  "version": "1.0.0",
  "weights": {
    "liquidity": 0.2,
    "marketStructure": 0.2,
    "multiTimeframe": 0.2,
    "sessionLiquidity": 0.1,
    "volume": 0.1,
    "derivatives": 0.1,
    "advancedLayer3": 0.1
  },
  "timeframes": ["1m", "5m", "15m", "1h", "4h", "1d"],
  "sessions": {
    "asian": { "startHourUTC": 0, "endHourUTC": 8, "name": "Asian (Tokyo / Sydney)" },
    "london": { "startHourUTC": 7, "endHourUTC": 15, "name": "London (European)" },
    "newYork": { "startHourUTC": 13, "endHourUTC": 21, "name": "New York (US)" }
  },
  "thresholds": {
    "minSignalScore": 50,
    "strongSignalScore": 75,
    "veryStrongSignalScore": 85,
    "equalHighPercent": 0.25,
    "sweepMinPenetration": 0.04,
    "sweepMaxPenetration": 2.5
  },
  "defaultSymbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]
}
```

---

## Backtest

### `POST /api/backtest`

Runs an in-memory historical backtest simulation.

**Request Body (JSON):**
```json
{
  "symbol": "BTCUSDT",
  "timeframe": "15m",
  "minScore": 65,
  "candleLimit": 500
}
```

### `GET /api/backtest`

Same as POST but uses query parameters.

**Query Parameters:**

| Param       | Type   | Default    | Description                    |
| :---------- | :----- | :--------- | :----------------------------- |
| `symbol`    | string | `BTCUSDT`  | Trading pair                   |
| `tf`        | string | `15m`      | Timeframe                      |
| `minScore`  | number | `65`       | Minimum signal score threshold |

**Response:**
```json
{
  "symbol": "BTCUSDT",
  "timeframe": "15m",
  "startDate": "2024-10-01",
  "endDate": "2025-01-15",
  "candlesAnalyzed": 500,
  "overallMetrics": {
    "totalTrades": 24,
    "winningTrades": 15,
    "losingTrades": 9,
    "winRate": 62.5,
    "profitFactor": 1.85,
    "expectancy": 0.45,
    "maxDrawdownPercent": 8.32,
    "avgRR": 1.65,
    "sharpeRatio": 1.42,
    "sortinoRatio": 2.15,
    "cumulativeReturnPercent": 12.8,
    "equityCurve": [ /* ... */ ]
  },
  "walkForward": {
    "training": { /* ... */ },
    "validation": { /* ... */ },
    "outOfSample": { /* ... */ },
    "overfitWarning": false
  },
  "failureBreakdown": {
    "liquidityFailures": 3,
    "falseBreakouts": 2,
    "weakDisplacement": 2,
    "badHTFAlignment": 1,
    "volumeFailure": 1,
    "extremeFundingSqueeze": 0,
    "totalLosses": 9
  },
  "trades": [ /* array of simulated trades */ ]
}
```

---

## Error Responses

All endpoints return consistent error structures:

```json
{
  "error": "Description of what went wrong",
  "status": "ANALYSIS_ERROR",
  "timestamp": 1705312800000
}
```

**Common error statuses:**

| Status               | HTTP Code | Description                         |
| :------------------- | :-------- | :---------------------------------- |
| `DATA_SOURCE_ERROR`  | 500       | Failed to fetch from Binance/CoinGecko |
| `ANALYSIS_ERROR`     | 500       | Analysis engine failed              |
| `SCANNER_ERROR`      | 500       | Scanner execution failed            |

---

## Rate Limiting

The server does not impose client-side rate limits. However, Binance public APIs have rate limits (~1200 requests/minute for spot). The system handles this automatically with:

- **8-second in-memory cache** on hot routes
- **Exponential backoff** on 429 responses
- **Alternate URL rotation** across Binance mirrors
- **Controlled concurrency** (4–5 parallel requests in scanner)