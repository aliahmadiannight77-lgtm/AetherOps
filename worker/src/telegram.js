import { generateReply, MODELS } from './ai.js'
import { isChannelMember, requiredChannel } from './channel.js'
import { safeEqual, sha256 } from './crypto.js'
import { error, json } from './http.js'
import { consumeRateLimit } from './auth.js'
import { telegramText as t } from './telegram-i18n.js'

async function telegramCall(env, method, payload) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured')
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(`Telegram API ${method} failed`)
  return body.result
}

async function sendText(env, chatId, text, replyMarkup) {
  return telegramCall(env, 'sendMessage', {
    chat_id: chatId,
    text: String(text || '').slice(0, 4_000),
    link_preview_options: { is_disabled: true },
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  })
}

function joinKeyboard(language) {
  return {
    inline_keyboard: [
      [{ text: t(language, 'joinButton'), url: requiredChannel.url }],
      [{ text: t(language, 'verifyButton'), callback_data: 'verify_channel' }],
    ],
  }
}

function appKeyboard(env, language) {
  const url = env.AETHEROPS_WEB_URL || 'https://aetherops.codebox-lab.workers.dev'
  return {
    inline_keyboard: [
      [{ text: t(language, 'appButton'), web_app: { url } }],
      [{ text: t(language, 'webButton'), url }],
    ],
  }
}

async function sendJoinPrompt(env, chatId, language) {
  await sendText(env, chatId, t(language, 'joinPrompt'), joinKeyboard(language))
}

async function sendMembershipUnavailable(env, chatId, language) {
  await sendText(env, chatId, t(language, 'unavailable'), joinKeyboard(language))
}

async function sendAppLink(env, chatId, language) {
  await sendText(env, chatId, t(language, 'verified'), appKeyboard(env, language))
}

async function consumeLinkCode(env, { codeValue, from, chatId, language }) {
  const code = String(codeValue || '').toUpperCase()
  const codeHash = await sha256(code)
  const pending = await env.DB.prepare('SELECT user_id, expires_at FROM telegram_link_codes WHERE code_hash = ?').bind(codeHash).first()
  if (!pending || pending.expires_at < Date.now()) {
    await sendText(env, chatId, '🔴 این کد اتصال معتبر نیست یا منقضی شده است. از پنل وب یک کد تازه بساز.')
    return
  }

  const alreadyLinked = await env.DB.prepare('SELECT user_id FROM telegram_links WHERE telegram_user_id = ?').bind(String(from.id)).first()
  if (alreadyLinked && alreadyLinked.user_id !== pending.user_id) {
    await sendText(env, chatId, '🔴 این تلگرام به حساب دیگری وصل است. ابتدا اتصال قبلی را از پنل همان حساب قطع کن.')
    return
  }

  const consumed = await env.DB.prepare('DELETE FROM telegram_link_codes WHERE code_hash = ? AND expires_at >= ? RETURNING user_id')
    .bind(codeHash, Date.now()).first()
  if (!consumed) {
    await sendText(env, chatId, '🔴 این کد قبلاً استفاده شده یا منقضی شده است. یک کد تازه بساز.')
    return
  }

  const now = Date.now()
  await env.DB.prepare(`INSERT INTO telegram_links(user_id, telegram_user_id, telegram_chat_id, linked_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET telegram_user_id=excluded.telegram_user_id, telegram_chat_id=excluded.telegram_chat_id, linked_at=excluded.linked_at`)
    .bind(consumed.user_id, String(from.id), String(chatId), now).run()
  await sendText(env, chatId, '🟢 اتصال انجام شد. حالا از دکمهٔ زیر پنل AetherOps را باز کن.', appKeyboard(env, language))
}

async function handleCallback(env, callback) {
  if (callback.data !== 'verify_channel') return
  const chatId = callback.message?.chat?.id
  if (!chatId || callback.message?.chat?.type !== 'private') return
  const language = callback.from?.language_code

  try {
    const member = await isChannelMember(env, String(callback.from.id))
    if (!member) {
      await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: t(language, 'checkAgain') })
      await sendJoinPrompt(env, chatId, language)
      return
    }
    await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: t(language, 'checkDone') })
    await sendAppLink(env, chatId, language)
  } catch {
    await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: t(language, 'checkFailed') })
    await sendMembershipUnavailable(env, chatId, language)
  }
}

async function handleMessage(env, message) {
  const chat = message?.chat
  const from = message?.from
  const language = from?.language_code
  const text = typeof message?.text === 'string' ? message.text.trim() : ''
  if (!chat || !from || !text || chat.type !== 'private') return
  if (!(await consumeRateLimit(env, 'telegram_user_minute', String(from.id), 20, 60 * 1000))) {
    await sendText(env, chat.id, language === 'fa' ? '⏳ تعداد پیام‌ها زیاد است؛ یک دقیقهٔ دیگر دوباره تلاش کن.' : '⏳ Too many messages. Please try again in one minute.')
    return
  }

  let member
  try {
    member = await isChannelMember(env, String(from.id))
  } catch {
    await sendMembershipUnavailable(env, chat.id, language)
    return
  }
  if (!member) {
    await sendJoinPrompt(env, chat.id, language)
    return
  }

  const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{6,64}))?$/i)
  if (startMatch) {
    if (startMatch[1]) {
      await consumeLinkCode(env, { codeValue: startMatch[1], from, chatId: chat.id, language })
      return
    }
    await sendAppLink(env, chat.id, language)
    return
  }

  const linkMatch = text.match(/^\/link(?:@\w+)?\s+([A-Za-z0-9_-]{6,64})$/i)
  if (linkMatch) {
    await consumeLinkCode(env, { codeValue: linkMatch[1], from, chatId: chat.id, language })
    return
  }

  if (text === '/unlink') {
    await env.DB.prepare('DELETE FROM telegram_links WHERE telegram_user_id = ?').bind(String(from.id)).run()
    await sendText(env, chat.id, '🔴 اتصال این حساب قطع شد. برای اتصال دوباره از پنل وب استفاده کن.')
    return
  }

  if (text === '/help') {
    await sendText(env, chat.id,
      'AetherOps روی Cloudflare Workers AI پاسخ می‌دهد. از Mini App پنل را باز کن؛ برای قطع اتصال /unlink را بفرست.',
      appKeyboard(env, language))
    return
  }

  const linked = await env.DB.prepare('SELECT user_id FROM telegram_links WHERE telegram_user_id = ? AND telegram_chat_id = ?')
    .bind(String(from.id), String(chat.id)).first()
  if (!linked) {
    await sendText(env, chat.id, 'برای ذخیرهٔ گفت‌وگو در حساب خودت، ابتدا Mini App را باز کن تا حساب تلگرامت به AetherOps وصل شود.', appKeyboard(env, language))
    return
  }

  await telegramCall(env, 'sendChatAction', { chat_id: chat.id, action: 'typing' })
  const model = env.TELEGRAM_DEFAULT_MODEL && MODELS.has(env.TELEGRAM_DEFAULT_MODEL) ? env.TELEGRAM_DEFAULT_MODEL : '@cf/google/gemma-4-26b-a4b-it'
  const result = await generateReply(env, { userId: linked.user_id, message: text, model, channel: 'telegram' })
  await sendText(env, chat.id, result.answer)
}

export async function telegramWebhook(request, env) {
  const secret = request.headers.get('x-telegram-bot-api-secret-token') || ''
  if (!env.TELEGRAM_WEBHOOK_SECRET || !safeEqual(secret, env.TELEGRAM_WEBHOOK_SECRET)) return error('درخواست webhook رد شد.', 403, 'telegram_secret_invalid')
  if (!env.DB || !env.AI || !env.TELEGRAM_BOT_TOKEN) return error('ربات تلگرام هنوز پیکربندی نشده است.', 503, 'telegram_not_configured')

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 64_000) return error('درخواست بیش از اندازه بزرگ است.', 413, 'payload_too_large')
  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > 64_000) return error('درخواست بیش از اندازه بزرگ است.', 413, 'payload_too_large')
  let update
  try { update = JSON.parse(raw || '{}') } catch { return error('JSON معتبر نیست.', 400, 'invalid_json') }
  if (!Number.isInteger(update.update_id)) return json({ ok: true })
  const seen = await env.DB.prepare('INSERT OR IGNORE INTO telegram_updates(update_id, created_at) VALUES (?, ?)').bind(update.update_id, Date.now()).run()
  if (!seen.meta.changes) return json({ ok: true })

  try {
    if (update.callback_query) await handleCallback(env, update.callback_query)
    else await handleMessage(env, update.message)
    await env.DB.prepare('DELETE FROM telegram_updates WHERE created_at < ?').bind(Date.now() - 7 * 24 * 60 * 60 * 1000).run()
    return json({ ok: true })
  } catch (cause) {
    await env.DB.prepare('DELETE FROM telegram_updates WHERE update_id = ?').bind(update.update_id).run()
    console.error('telegram_update_failed', cause?.code || 'unknown')
    return error('پردازش پیام تلگرام موقتاً انجام نشد.', 500, 'telegram_update_failed')
  }
}
