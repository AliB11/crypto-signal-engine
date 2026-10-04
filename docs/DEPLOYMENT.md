# Deployment Guide

## Prerequisites

- **Node.js** >= 18.17.0
- **npm** >= 10.0.0
- **Cloudflare Account** (for Worker deployment)
- **Wrangler CLI** (installed automatically via npx)

---

## Local Development

```bash
# 1. Clone the repository
git clone https://github.com/crypto-signal-scanner/crypto-signal-scanner.git
cd crypto-signal-scanner

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env

# 4. Start development server (Next.js)
npm run dev
```

The application will be available at `http://localhost:3000`.

---

## Production Build (Next.js)

```bash
# Build
npm run build

# Start production server
npm start
```

---

## Cloudflare Worker Deployment

### Prerequisites

1. Create a Cloudflare account at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Get your Account ID from the dashboard (right sidebar on any zone page).
3. Create an API Token:
   - Go to [My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - Use the "Edit Cloudflare Workers" template
   - Or create a custom token with `Account > Workers Scripts > Edit` permission

### Configure Wrangler

```bash
# Login to Cloudflare
npx wrangler login

# Verify authentication
npx wrangler whoami
```

### Set Secrets (if needed in future)

```bash
# For any future API keys that require server-side storage
npx wrangler secret put COINGECKO_API_KEY
```

### Deploy

```bash
# Deploy the Worker
npx wrangler deploy
```

The worker will be available at `https://crypto-signal-scanner.<your-subdomain>.workers.dev`.

### Verify Deployment

```bash
# Health check
curl https://crypto-signal-scanner.<your-subdomain>.workers.dev/api/health

# Scanner test
curl https://crypto-signal-scanner.<your-subdomain>.workers.dev/api/scanner?tier=top10
```

### Cron Trigger

The worker automatically runs a scanner cron job every minute (`* * * * *`) as configured in `wrangler.toml`:

```toml
[triggers]
crons = ["* * * * *"]
```

Monitor cron execution in the Cloudflare dashboard under **Workers & Pages → your worker → Triggers → Cron Triggers**.

---

## GitHub Actions CI/CD

The repository includes a GitHub Actions workflow (`.github/workflows/ci.yml`) that automatically:

1. **Lint & Typecheck** on every push and PR
2. **Run tests** after lint passes
3. **Build** the production bundle after tests pass
4. **Deploy** to Cloudflare Workers on push to `main`

### Required Secrets

Add these to your GitHub repository settings (Settings → Secrets and variables → Actions):

| Secret                    | Description                          |
| :------------------------ | :----------------------------------- |
| `CLOUDFLARE_API_TOKEN`    | Cloudflare API Token with Worker edit permissions |
| `CLOUDFLARE_ACCOUNT_ID`   | Your Cloudflare Account ID           |

### Workflow Trigger

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
```

---

## Environment Variables

| Variable             | Required | Default | Description                          |
| :------------------- | :------- | :------ | :----------------------------------- |
| `NODE_ENV`           | No       | `development` | `development` or `production`  |
| `COINGECKO_API_KEY`  | No       | (none)  | CoinGecko Pro API key (optional)     |

**Note:** Binance public APIs do not require API keys. The scanner works out-of-the-box with zero configuration.

---

## Custom Domain (Optional)

### Cloudflare Worker Custom Domain

1. Go to your Worker in the Cloudflare dashboard
2. Navigate to **Settings → Domains & Routes**
3. Add a custom domain (e.g., `scanner.yourdomain.com`)
4. DNS records will be configured automatically if the domain is on Cloudflare

---

## Monitoring & Logging

### Worker Logs

```bash
# Tail live worker logs
npx wrangler tail
```

### Health Endpoint Monitoring

Set up external monitoring (e.g., UptimeRobot, Better Uptime) to ping:

```
GET https://your-worker.workers.dev/api/health
```

Expected response: `{ "ok": true }`

---

## Troubleshooting

### Build Fails

```bash
# Clear cache and rebuild
rm -rf .next node_modules
npm install
npm run build
```

### Worker Deploy Fails

```bash
# Check wrangler authentication
npx wrangler whoami

# Check wrangler.toml configuration
cat wrangler.toml

# Try verbose deploy
npx wrangler deploy --log-level debug
```

### Binance API Not Reachable

The Binance Provider includes fallback URL rotation. If all mirrors fail:
- Check if your IP/region has access to Binance
- The system will automatically fall back to CoinGecko for metadata
- Fallback synthetic data generation will kick in for chart display

---

## Performance Optimization

- **Scanner concurrency**: Adjust `concurrency` parameter in `/api/scanner` (default: 4–5)
- **Cache TTL**: 8-second in-memory cache on Binance requests
- **Candle limit**: Use 120–200 candles for analysis, 500 for backtesting
- **Edge deployment**: Cloudflare Workers run in 300+ edge locations globally