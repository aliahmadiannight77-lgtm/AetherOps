# Secrets and deployment

## Never commit credentials

Keep local secrets in `worker/.dev.vars` (ignored by Git) and production secrets in Cloudflare Worker Secrets. Do not put secrets in Vite variables, `src/`, `wrangler.toml`, screenshots, issue reports, or Telegram messages.

| Secret | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Bot API credential from BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Random value checked against Telegram's secret-token header |

Generate random secrets locally with a cryptographically secure generator. Use different values for local and production environments. Set production values with `wrangler secret put NAME`; the command deploys a Worker version. Review the target Worker before running it.

## First deployment

1. Create a Cloudflare account and enable Workers AI.
2. Create the D1 database: `npx wrangler d1 create aetherops`.
3. Copy the generated database ID into `worker/wrangler.toml` in place of the `REPLACE_...` marker.
4. Apply the schema: `npm run db:remote`.
5. Add the secrets above through `wrangler secret put`.
6. Deploy with `npm run deploy`.
7. Create a Telegram bot with BotFather, add it as a channel administrator, store its token as a Worker secret, then configure its webhook as described in [the bot guide](../docs/telegram-bot.md).

Workers AI has a daily free neuron allocation; when it is exhausted, inference fails until the reset. The app also applies its own shared daily text-token ceiling as a guardrail. D1 free storage is limited, so apply retention and backup practices before accepting public sign-ups.

## Rotation

- **Telegram bot token:** rotate through BotFather, immediately update the Cloudflare secret, and set the webhook again.
- **Webhook secret:** generate a new value, update Cloudflare and Telegram webhook configuration together.
- **Leaked API token:** revoke its row in the dashboard immediately. Since only the hash is stored, the original secret cannot be recovered.
