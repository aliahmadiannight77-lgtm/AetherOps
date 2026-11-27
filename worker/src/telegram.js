import { generateReply, MODEL_LIST, MODELS } from './ai.js'
import { isChannelMember, requiredChannel } from './channel.js'
import { safeEqual, sha256 } from './crypto.js'
import { error, json } from './http.js'
import { consumeRateLimit } from './auth.js'
import { bindTelegramLoginChallenge, issueTelegramLoginCode } from './telegram-auth.js'
import { telegramCommandText as command, telegramLoginCodeMessage, telegramText as t } from './telegram-i18n.js'

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

function joinKeyboard(language, loginState = '') {
  return {
    inline_keyboard: [
      [{ text: t(language, 'joinButton'), url: requiredChannel.url }],
      [{ text: t(language, 'verifyButton'), callback_data: loginState ? `verify_channel:${loginState}` : 'verify_channel' }],
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

async function sendJoinPrompt(env, chatId, language, loginState = '') {
  await sendText(env, chatId, t(language, 'joinPrompt'), joinKeyboard(language, loginState))
}

async function sendMembershipUnavailable(env, chatId, language, loginState = '') {
  await sendText(env, chatId, t(language, 'unavailable'), joinKeyboard(language, loginState))
}

async function sendAppLink(env, chatId, language) {
  await sendText(env, chatId, t(language, 'verified'), appKeyboard(env, language))
}

async function sendWebsiteLoginCode(env, chatId, language, state, telegramUser) {
  const code = await issueTelegramLoginCode(env, state, telegramUser)
  if (!code) {
    const message = String(language || '').toLowerCase().startsWith('fa')
      ? '⏳ برای این ورود کد تازه‌ای ساخته نشد. از همان صفحهٔ سایت دوباره شروع کن.'
      : '⏳ A new sign-in code could not be issued. Start again from the website.'
    await sendText(env, chatId, message)
    return
  }
  await sendText(env, chatId, telegramLoginCodeMessage(language, code), appKeyboard(env, language))
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
  const modelMatch = String(callback.data || '').match(/^model:(\d)$/)
  if (modelMatch) {
    const chatId = callback.message?.chat?.id
    const from = callback.from
    const language = from?.language_code
    const model = MODEL_LIST[Number(modelMatch[1])]
    if (!chatId || callback.message?.chat?.type !== 'private' || !model) return
    const linked = await env.DB.prepare('SELECT user_id FROM telegram_links WHERE telegram_user_id = ? AND telegram_chat_id = ?')
      .bind(String(from.id), String(chatId)).first()
    if (!linked) {
      await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: command(language, 'modelRequired'), show_alert: true })
      return
    }
    try {
      if (!(await isChannelMember(env, String(from.id)))) {
        await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: t(language, 'checkAgain'), show_alert: true })
        await sendJoinPrompt(env, chatId, language)
        return
      }
      await env.DB.prepare(`INSERT INTO telegram_preferences(telegram_user_id, user_id, model, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(telegram_user_id) DO UPDATE SET user_id=excluded.user_id, model=excluded.model, updated_at=excluded.updated_at`)
        .bind(String(from.id), linked.user_id, model.id, Date.now()).run()
      await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: command(language, 'modelSelected', { model: model.label }) })
      await sendText(env, chatId, command(language, 'modelSelected', { model: model.label }), modelKeyboard(language, model.id))
    } catch {
      await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: t(language, 'checkFailed'), show_alert: true })
    }
    return
  }
  const match = String(callback.data || '').match(/^verify_channel(?::([A-Za-z0-9_-]{32}))?$/)
  if (!match) return
  const loginState = match[1] || ''
  const chatId = callback.message?.chat?.id
  if (!chatId || callback.message?.chat?.type !== 'private') return
  const language = callback.from?.language_code

  try {
    const member = await isChannelMember(env, String(callback.from.id))
    if (!member) {
      await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: t(language, 'checkAgain') })
      await sendJoinPrompt(env, chatId, language, loginState)
      return
    }
    await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: t(language, 'checkDone') })
    if (loginState) await sendWebsiteLoginCode(env, chatId, language, loginState, callback.from)
    else await sendAppLink(env, chatId, language)
  } catch {
    await telegramCall(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: t(language, 'checkFailed') })
    await sendMembershipUnavailable(env, chatId, language, loginState)
  }
}

function modelKeyboard(language, selectedModel = '') {
  return { inline_keyboard: MODEL_LIST.map((model, index) => [{
    text: `${model.id === selectedModel ? '✓ ' : ''}${model.label}`,
    callback_data: `model:${index}`,
  }]) }
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

  const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{6,64}))?$/i)
  if (startMatch?.[1]?.toLowerCase().startsWith('web_')) {
    const state = startMatch[1].slice(4)
    if (!(await bindTelegramLoginChallenge(env, state, from))) {
      const message = String(language || '').toLowerCase().startsWith('fa')
        ? '🔴 لینک ورود نامعتبر یا منقضی شده است. صفحهٔ سایت را تازه کن و دوباره تلاش کن.'
        : '🔴 This sign-in link is invalid or expired. Refresh the website and try again.'
      await sendText(env, chat.id, message)
      return
    }
    try {
      const member = await isChannelMember(env, String(from.id))
      if (!member) {
        await sendJoinPrompt(env, chat.id, language, state)
        return
      }
      await sendWebsiteLoginCode(env, chat.id, language, state, from)
    } catch {
      await sendMembershipUnavailable(env, chat.id, language, state)
    }
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
    await env.DB.prepare('DELETE FROM telegram_preferences WHERE telegram_user_id = ?').bind(String(from.id)).run()
    await sendText(env, chat.id, command(language, 'unlinked'))
    return
  }

  if (/^\/(help|start)(?:@\w+)?$/i.test(text)) {
    await sendText(env, chat.id, command(language, 'help'), appKeyboard(env, language))
    return
  }

  const linked = await env.DB.prepare(`SELECT l.user_id, p.model FROM telegram_links l
    LEFT JOIN telegram_preferences p ON p.telegram_user_id = l.telegram_user_id AND p.user_id = l.user_id
    WHERE l.telegram_user_id = ? AND l.telegram_chat_id = ?`)
    .bind(String(from.id), String(chat.id)).first()
  if (!linked) {
    await sendText(env, chat.id, command(language, 'chatLinkRequired'), appKeyboard(env, language))
    return
  }

  if (/^\/model(?:@\w+)?$/i.test(text)) {
    const selected = linked.model && MODELS.has(linked.model) ? linked.model : (env.TELEGRAM_DEFAULT_MODEL || MODEL_LIST[0].id)
    await sendText(env, chat.id, command(language, 'modelPrompt'), modelKeyboard(language, selected))
    return
  }

  await telegramCall(env, 'sendChatAction', { chat_id: chat.id, action: 'typing' })
  const model = linked.model && MODELS.has(linked.model)
    ? linked.model
    : env.TELEGRAM_DEFAULT_MODEL && MODELS.has(env.TELEGRAM_DEFAULT_MODEL) ? env.TELEGRAM_DEFAULT_MODEL : MODEL_LIST[0].id
  try {
    const result = await generateReply(env, { userId: linked.user_id, message: text, model, channel: 'telegram' })
    await sendText(env, chat.id, result.answer)
  } catch (cause) {
    await sendText(env, chat.id, cause?.code === 'daily_quota_reached' ? command(language, 'quotaReached') : command(language, 'aiUnavailable'))
  }
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
