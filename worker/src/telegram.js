import { generateReply, MODELS } from './ai.js'
import { safeEqual, sha256 } from './crypto.js'
import { error, json } from './http.js'
import { consumeRateLimit } from './auth.js'

async function telegramCall(env, method, payload) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured')
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`Telegram API ${method} failed with ${response.status}`)
  const body = await response.json()
  if (!body.ok) throw new Error(`Telegram API ${method} returned an error`)
  return body.result
}

async function sendText(env, chatId, text) {
  const safeText = String(text || '').slice(0, 4_000)
  return telegramCall(env, 'sendMessage', { chat_id: chatId, text: safeText, link_preview_options: { is_disabled: true } })
}

async function handleMessage(env, message) {
  const chat = message.chat
  const from = message.from
  const text = typeof message.text === 'string' ? message.text.trim() : ''
  if (!chat || !from || !text || chat.type !== 'private') return
  if (!(await consumeRateLimit(env, 'telegram_user_minute', String(from.id), 20, 60 * 1000))) {
    await sendText(env, chat.id, 'تعداد پیام‌ها زیاد است؛ کمی بعد دوباره تلاش کن.')
    return
  }

  if (text === '/start' || text.startsWith('/start ')) {
    await sendText(env, chat.id, 'سلام! برای اتصال این ربات به حساب AetherOps، از پنل وب کد اتصال بساز و اینجا بفرست: /link کد')
    return
  }

  const linkMatch = text.match(/^\/link(?:@\w+)?\s+([A-Za-z0-9]{6,12})$/i)
  if (linkMatch) {
    const codeHash = await sha256(linkMatch[1].toUpperCase())
    const code = await env.DB.prepare('SELECT user_id, expires_at FROM telegram_link_codes WHERE code_hash = ?').bind(codeHash).first()
    if (!code || code.expires_at < Date.now()) {
      await sendText(env, chat.id, 'کد اتصال معتبر نیست یا منقضی شده. از پنل یک کد تازه بگیر.')
      return
    }
    const consumed = await env.DB.prepare('DELETE FROM telegram_link_codes WHERE code_hash = ? AND expires_at >= ? RETURNING user_id').bind(codeHash, Date.now()).first()
    if (!consumed) {
      await sendText(env, chat.id, 'این کد قبلاً استفاده شده یا منقضی شده. از پنل یک کد تازه بگیر.')
      return
    }
    const alreadyLinked = await env.DB.prepare('SELECT user_id FROM telegram_links WHERE telegram_user_id = ?').bind(String(from.id)).first()
    if (alreadyLinked && alreadyLinked.user_id !== code.user_id) {
      await sendText(env, chat.id, 'این حساب تلگرام به حساب دیگری متصل است. ابتدا از همان حساب آن را جدا کن.')
      return
    }
    const now = Date.now()
    await env.DB.batch([
      env.DB.prepare('INSERT INTO telegram_links(user_id, telegram_user_id, telegram_chat_id, linked_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET telegram_user_id=excluded.telegram_user_id, telegram_chat_id=excluded.telegram_chat_id, linked_at=excluded.linked_at')
        .bind(consumed.user_id, String(from.id), String(chat.id), now),
    ])
    await sendText(env, chat.id, 'حساب تلگرام با موفقیت به AetherOps وصل شد. پیام بعدی‌ات را بفرست تا گفت‌وگو کنیم.')
    return
  }

  if (text === '/unlink') {
    await env.DB.prepare('DELETE FROM telegram_links WHERE telegram_user_id = ?').bind(String(from.id)).run()
    await sendText(env, chat.id, 'اتصال تلگرام قطع شد.')
    return
  }

  if (text === '/help') {
    await sendText(env, chat.id, 'پیامت را بفرست تا با مدل رایگان Cloudflare Workers AI پاسخ بدهم. برای قطع اتصال /unlink را بزن.')
    return
  }

  const linked = await env.DB.prepare('SELECT user_id FROM telegram_links WHERE telegram_user_id = ? AND telegram_chat_id = ?').bind(String(from.id), String(chat.id)).first()
  if (!linked) {
    await sendText(env, chat.id, 'ابتدا این ربات را به حساب خودت وصل کن: در پنل AetherOps کد اتصال بساز و /link کد را بفرست.')
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
    await handleMessage(env, update.message)
    await env.DB.prepare('DELETE FROM telegram_updates WHERE created_at < ?').bind(Date.now() - 7 * 24 * 60 * 60 * 1000).run()
    return json({ ok: true })
  } catch (cause) {
    await env.DB.prepare('DELETE FROM telegram_updates WHERE update_id = ?').bind(update.update_id).run()
    console.error('telegram_update_failed', cause?.message || 'unknown')
    return error('پردازش پیام تلگرام موقتاً انجام نشد.', 500, 'telegram_update_failed')
  }
}
