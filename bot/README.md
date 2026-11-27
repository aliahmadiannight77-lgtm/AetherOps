# Telegram bot module

The AetherOps bot is implemented as a route in the edge Worker at `worker/src/telegram.js`. It reuses the same D1 records, Workers AI models, and daily application quota as the web chat.

## Commands

- `/start` — explains how to link the bot.
- `/link CODE` — consumes a short-lived, one-use code from the signed-in web panel.
- `/help` — lists the basic bot behavior.
- `/unlink` — removes the Telegram account link.
- Any other text — sends a prompt to the selected free Workers AI model and stores the response in the Telegram chat history.

## Security notes

- The webhook rejects requests without the secret-token header.
- Linking works only in a private Telegram chat.
- Update IDs are deduplicated in D1.
- Bot tokens and webhook secrets belong in Cloudflare Worker Secrets, never in this folder or a browser bundle.
- Bot conversations are not Telegram Secret Chats; users should avoid sending sensitive information.

See [the setup guide](../docs/telegram-bot.md) and [security controls](../security/ABUSE_CONTROLS.md).
