# Incident response

## If an API token leaks

1. Revoke the token from the AetherOps API-token page or delete its row from D1.
2. Review Worker logs and `api_tokens.last_used_at` for unexpected use.
3. Create a replacement only after removing the leak from local files, CI variables, and logs.

## If the Telegram bot token leaks

1. Revoke or regenerate the token in BotFather.
2. Update `TELEGRAM_BOT_TOKEN` with `wrangler secret put`.
3. Reconfigure the webhook with the new token and a fresh webhook secret.
4. Review recent Worker invocations and unlink any affected Telegram account.

## If account sessions or email codes are suspected compromised

1. Delete the user's rows from `sessions` and `otp_challenges` in D1.
2. Remove the address from `VERIFIED_LOGIN_EMAILS` while investigating.
3. Rotate `AUTH_PEPPER` if its value may have been exposed; this invalidates outstanding one-time codes.
4. Check for unexpected chat exports, token creation, and deletion activity.

## After containment

Record the UTC time, affected resource, user impact, and remediation in a private incident log. Avoid putting secrets or personal chat content in public GitHub issues.
