# Threat model

## Assets

- User email addresses, login challenges, and sessions.
- Chat messages and model responses stored in D1.
- API token hashes and Telegram account links.
- Cloudflare bindings and secrets, especially email, AI, and Telegram credentials.
- The daily free Workers AI allocation.

## Trust boundaries

1. Browser to same-origin Worker API.
2. Worker to D1, Workers AI, and Cloudflare Email Service bindings.
3. Telegram platform to `/api/telegram/webhook`.
4. GitHub source history and deployment automation.

## Main risks and current mitigations

| Risk | Mitigation |
| --- | --- |
| OTP guessing or resend abuse | 8-digit code, 10-minute expiry, five attempts, 60-second resend delay, verified-email allowlist |
| Session theft through script or cross-site requests | HttpOnly/Secure/SameSite cookie, same-origin checks, restrictive CSP |
| Cross-account chat access | Every chat lookup, deletion, and token action is scoped to the authenticated user ID |
| API key exposure in source or browser | Backend-only creation; high-entropy key is returned once; only SHA-256 hash is persisted |
| Forged Telegram webhook | Validate `X-Telegram-Bot-Api-Secret-Token`; deduplicate update IDs |
| Bot or model quota exhaustion | Text length caps, fixed model allowlist, shared daily token ceiling |
| Secret leakage in Git | `.dev.vars` and environment files are ignored; CI secret scan runs on pushes and pull requests |
| HTML/script injection from model output | Render model output as text; do not use `dangerouslySetInnerHTML` |

## Residual risks

- D1-backed OTP throttling can race under concurrent requests; the free-plan rollout should stay limited to a small verified-email allowlist.
- Token counting is an estimate and cannot exactly predict model neuron usage.
- Telegram only provides end-to-end encryption in Secret Chats; messages sent to this bot are processed by Telegram and AetherOps.
- Local `npm run dev` serves only the frontend. Use `npm run dev:edge` with local D1 migrations for an end-to-end flow; do not treat a static preview as a live backend.
