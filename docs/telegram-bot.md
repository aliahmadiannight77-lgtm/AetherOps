# AetherOps Telegram bot

The bot runs inside the same Cloudflare Worker as the web app. Telegram updates arrive at `POST /api/telegram/webhook`; there is no separate server to keep running.

## Setup

1. Create a bot through [BotFather](https://t.me/BotFather) and copy the bot token directly into a secure place.
2. Store `TELEGRAM_BOT_TOKEN` and a random `TELEGRAM_WEBHOOK_SECRET` as Cloudflare Worker secrets. Never put either value in the frontend or Git.
3. Deploy AetherOps and note its HTTPS `workers.dev` URL.
4. Set Telegram's webhook URL to `https://YOUR-WORKER.workers.dev/api/telegram/webhook` and its `secret_token` to the exact value stored in `TELEGRAM_WEBHOOK_SECRET`. Use the Telegram Bot API `setWebhook` method over HTTPS.
5. In the web panel, create a Telegram link code, open the bot in a private chat, and send `/link CODE` before the code expires.

The account owner can send `/unlink` in a private chat. The bot accepts ordinary text after linking, `/help` for instructions, and responds using the default free Workers AI model.

## Privacy

Telegram bot conversations are not Secret Chats. Telegram delivers their contents to the bot, and AetherOps stores them in D1 to maintain chat history. The bot only links from private chats and only answers users whose Telegram ID is linked to an AetherOps account.
