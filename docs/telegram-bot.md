# AetherOps Telegram bot

The bot runs inside the same Cloudflare Worker as the web app. Telegram updates arrive at `POST /api/telegram/webhook`; there is no separate server to keep running.

## Setup

1. Create a bot through [BotFather](https://t.me/BotFather) and copy the bot token directly into a secure place.
2. Add the bot as an administrator to `@PythonCodingAcademy`. Telegram only guarantees `getChatMember` for other users when the bot is an administrator; without this, membership checks fail closed.
3. Store `TELEGRAM_BOT_TOKEN` and a random `TELEGRAM_WEBHOOK_SECRET` as Cloudflare Worker secrets. Never put either value in the frontend or Git.
4. Deploy AetherOps and note its HTTPS `workers.dev` URL.
5. Set Telegram's webhook URL to `https://YOUR-WORKER.workers.dev/api/telegram/webhook` and its `secret_token` to the exact value stored in `TELEGRAM_WEBHOOK_SECRET`. Use the Telegram Bot API `setWebhook` method over HTTPS.
6. In a private chat, `/start` shows the channel join button. After joining, select **Check membership**; the bot then sends the web link and a **Mini App** button with the same interface.

## Sign-in and Mini App

Email sign-in has been removed. The Mini App sends `Telegram.WebApp.initData` to the Worker, which verifies Telegram's HMAC and timestamp before creating a session. Membership is checked again server-side before login and before each AI chat request. Open the Mini App from the button in the bot; a regular browser link has no signed Telegram context and will direct the visitor back to the bot.

The account owner can send `/unlink` in a private chat. The bot accepts ordinary text, `/help` for instructions, and responds using the default free Workers AI model in the language of the user's message.

## Privacy

Telegram bot conversations are not Secret Chats. Telegram delivers their contents to the bot, and AetherOps stores them in D1 to maintain chat history. The bot only links from private chats and only answers users whose Telegram ID is linked to an AetherOps account.
