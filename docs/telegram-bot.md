# AetherOps Telegram bot

The bot runs inside the same Cloudflare Worker as the web app. Telegram updates arrive at `POST /api/telegram/webhook`; there is no separate server to keep running.

## Setup and BotFather

1. Create a bot through [BotFather](https://t.me/BotFather) and copy the bot token directly into a secure place.
2. Add the bot as an administrator to `@PythonCodingAcademy`. Telegram only guarantees `getChatMember` for other users when the bot is an administrator; without this, membership checks fail closed.
3. Store `TELEGRAM_BOT_TOKEN` and a random `TELEGRAM_WEBHOOK_SECRET` as Cloudflare Worker secrets. Never put either value in the frontend or Git.
4. Deploy AetherOps and note its HTTPS `workers.dev` URL.
5. Set Telegram's webhook URL to `https://YOUR-WORKER.workers.dev/api/telegram/webhook` and its `secret_token` to the exact value stored in `TELEGRAM_WEBHOOK_SECRET`. Use the Telegram Bot API `setWebhook` method over HTTPS.
6. In [@BotFather](https://t.me/BotFather), use `/mybots` → choose the bot → **Bot Settings → Configure Mini App → Enable Mini App**, then set the Main Mini App URL to `https://aetherops.codebox-lab.workers.dev`.
7. For a permanent chat button, use `/setmenubutton`, choose the bot, set its label (for example, `Open AetherOps`) and use the same HTTPS URL. This opens the existing app inside Telegram.
8. Set these commands with `/setcommands`:

```text
start - Start AetherOps and open the app
help - Show help and available commands
model - Choose the AI model for Telegram chat
link - Link an existing AetherOps account with a one-time code
unlink - Disconnect this Telegram account
```

9. Add the bot as an administrator of `@PythonCodingAcademy`. In a private chat, `/start` displays the channel join and check buttons. The bot confirms membership before sending the Mini App link or website sign-in code.

## Sign-in and Mini App

Email sign-in has been removed. In a regular browser, start sign-in on the website, open the generated one-time bot link, complete the channel check and enter the 8-digit code sent by the bot. The code expires after 10 minutes, is stored as a hash, is single-use and has a five-attempt limit. In Telegram, the Mini App sends `Telegram.WebApp.initData` to the Worker, which validates Telegram's HMAC and timestamp. Membership is checked server-side before login and each AI request.

The account owner can send `/model` to choose a model for Telegram; that preference is saved per linked account. The bot accepts ordinary text and replies in the language of each message. `/unlink` removes the Telegram connection and preference. Workers AI's free allowance is 10,000 Neurons per Cloudflare account per day; this is a shared usage allowance, not unlimited inference. The app exposes five models available without an extra provider key; Cloudflare can change plan eligibility and pricing, so review the current [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) before relying on a model.

## Privacy

Telegram bot conversations are not Secret Chats. Telegram delivers their contents to the bot, and AetherOps stores them in D1 to maintain chat history. The bot only links from private chats and only answers users whose Telegram ID is linked to an AetherOps account.
