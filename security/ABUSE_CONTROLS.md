# Abuse controls

## Login codes

- Use eight cryptographically random digits, including leading zeroes.
- Keep a challenge for ten minutes and allow no more than five guesses.
- Permit a new code once per minute per email.
- Limit OTP requests to ten per IP per hour.
- Restrict free-plan delivery to addresses verified in the Cloudflare account.
- Keep response text generic enough to avoid disclosing account state.

## AI usage

- Accept only the model IDs in `worker/src/ai.js`.
- Limit an individual prompt to 8,000 characters and model output to 1,024 tokens.
- Cap aggregate application input and output estimates at 20,000 tokens per UTC day.
- Treat Cloudflare's neuron limit as the final provider-side limit.
- Do not trust any usage value sent by the browser.

## Telegram

- Configure a webhook secret token and compare it on every request.
- Accept `/link` only in private chats; link codes expire after ten minutes and are single-use.
- Deduplicate Telegram update IDs and keep bot/API credentials only in Worker Secrets.
- Never log full update bodies, email addresses, codes, or message content.

## API keys

- Create random keys only on the server and return the secret once.
- Persist only a SHA-256 digest, a short prefix, and metadata.
- Allow a maximum of ten active keys per user; revoke by owned row ID.
- Treat bearer keys as password-equivalent credentials and use HTTPS only.
