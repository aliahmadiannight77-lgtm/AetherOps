# Security at AetherOps

This folder is the security source of truth for the project. Read these files before changing authentication, model access, personal data, or the Telegram bot.

- [Threat model](THREAT_MODEL.md): assets, trust boundaries, and likely abuse cases.
- [Secrets and deployment](SECRETS_AND_DEPLOYMENT.md): where credentials live and how to rotate them.
- [Abuse controls](ABUSE_CONTROLS.md): OTP, quota, API token, and webhook safeguards.
- [Incident response](INCIDENT_RESPONSE.md): containment and recovery steps.

## Implemented controls

- OTP values are random eight-digit codes, stored as keyed HMAC digests, expire after ten minutes, and allow at most five verification attempts.
- OTP resend is throttled per address and source IP. Free-plan email is allowlisted to addresses verified in the Cloudflare account.
- Browser sessions are random, stored as SHA-256 digests, `HttpOnly`, `SameSite=Strict`, and `Secure` on HTTPS.
- Account-owned chat and token routes scope every query by the authenticated user ID.
- API tokens are high-entropy, stored only as SHA-256 digests, and shown once at creation.
- Telegram webhook requests require Telegram's secret-token header; update IDs are deduplicated.
- Model IDs are allowlisted, prompt sizes are bounded, and a shared daily token cap protects the free allocation.
- Responses add CSP, frame, MIME-sniffing, referrer, and permissions headers.

## Known limits

This is an early-stage implementation. Cloudflare free quotas are account-wide; application token counting is an estimate and does not replace Cloudflare's neuron accounting. Rate limiting backed only by D1 does not offer the same atomic guarantees as a dedicated rate-limit service. Keep the deployment restricted to trusted verified addresses until a durable rate limiter and monitoring are configured.
