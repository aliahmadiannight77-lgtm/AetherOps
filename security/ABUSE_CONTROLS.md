# Abuse controls

## Telegram sign-in

- Validate Telegram Mini App HMAC and reject auth data older than five minutes.
- Treat `initDataUnsafe` as untrusted; only the server-verified `initData` may establish a session.
- Recheck channel membership in the Worker before granting AI access.

## AI usage

- Accept only the model IDs in `worker/src/ai.js`.
- Limit an individual prompt to 8,000 characters and model output to 1,024 tokens.
- Cap aggregate application input and output estimates at 20,000 tokens per UTC day.
- Treat Cloudflare's neuron limit as the final provider-side limit.
- Do not trust any usage value sent by the browser.

## Telegram

- Configure a webhook secret token and compare it on every request.
- Accept `/link` only in private chats; legacy-account link codes expire after ten minutes and are single-use.
- Deduplicate Telegram update IDs and keep bot/API credentials only in Worker Secrets.
- Never log full update bodies, Telegram credentials, link codes, or message content.

## API keys

- Create random keys only on the server and return the secret once.
- Persist only a SHA-256 digest, a short prefix, and metadata.
- Allow a maximum of ten active keys per user; revoke by owned row ID.
- Treat bearer keys as password-equivalent credentials and use HTTPS only.
