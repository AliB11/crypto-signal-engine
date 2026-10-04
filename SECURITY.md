# Security Policy

## Supported Versions

| Version | Supported          |
| :------ | :----------------- |
| 1.0.x   | ✅ Active support  |
| < 1.0   | ❌ No longer supported |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

### How to Report

1. **Do NOT open a public GitHub issue** for security vulnerabilities.
2. Email: **security@crypto-signal-scanner.dev** (or use GitHub's private vulnerability reporting).
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if available)

### What to Expect

- **Acknowledgment** within 48 hours.
- **Status update** within 5 business days.
- **Fix timeline** communicated once the issue is confirmed.

### Scope

**In scope:**
- Server-side code (API routes, analysis engines, Cloudflare Worker)
- Authentication or authorization bypass
- Injection attacks (e.g., SQL, XSS in rendered output)
- Secrets or API key exposure
- Denial of service vulnerabilities

**Out of scope:**
- Third-party dependencies (report upstream)
- Social engineering attacks
- Issues requiring physical access to the server
- Rate limiting on public Binance/CoinGecko APIs (this is a provider-side policy)

## Security Practices

- **No database**: Zero persistence layer eliminates SQL injection vectors.
- **No secrets in frontend**: Only `NEXT_PUBLIC_` prefixed variables are exposed client-side.
- **Public APIs only**: All Binance and CoinGecko calls use public, unauthenticated endpoints.
- **Server-side proxying**: Future API key requirements will use Cloudflare Secrets.
- **Dependency scanning**: CodeQL runs on every push to `main`.

## Responsible Disclosure

We kindly ask that you:
- Give us reasonable time to address the issue before public disclosure.
- Avoid exploiting the vulnerability beyond what is necessary to demonstrate it.
- Do not access or modify other users' data.