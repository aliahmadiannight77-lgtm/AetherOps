import { randomId } from './crypto.js'
import { error, json, readJson, requireSameOrigin } from './http.js'
import { requireChannelMembership } from './channel.js'

export const MODELS = new Set([
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/qwen/qwen3.8-27b',
])
const DAILY_TOKEN_LIMIT = 20_000
const MAX_MESSAGE_LENGTH = 8_000

function utcDay() {
  return new Date().toISOString().slice(0, 10)
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.length / 4))
}

export async function getUsage(env, userId) {
  const day = utcDay()
  const row = await env.DB.prepare('SELECT input_tokens, output_tokens, requests FROM usage_daily WHERE user_id = ? AND day_utc = ?').bind(userId, day).first()
  return {
    day,
    inputTokens: row?.input_tokens || 0,
    outputTokens: row?.output_tokens || 0,
    totalTokens: (row?.input_tokens || 0) + (row?.output_tokens || 0),
    requests: row?.requests || 0,
    dailyTokenLimit: DAILY_TOKEN_LIMIT,
  }
}

async function enforceDailyLimit(env, estimatedInput) {
  const day = utcDay()
  const row = await env.DB.prepare('SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total FROM usage_daily WHERE day_utc = ?').bind(day).first()
  if ((row?.total || 0) + estimatedInput > DAILY_TOKEN_LIMIT) {
    throw Object.assign(new Error('سهمیهٔ رایگان روزانهٔ AetherOps تمام شده است؛ فردا دوباره امتحان کن.'), { status: 429, code: 'daily_quota_reached' })
  }
}

export async function generateReply(env, { userId, chatId, message, model, channel = 'web', channelId = null }) {
  if (!MODELS.has(model)) throw Object.assign(new Error('این مدل در فهرست مدل‌های رایگان مجاز نیست.'), { status: 400, code: 'model_not_allowed' })
  if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE_LENGTH) {
    throw Object.assign(new Error('پیام باید بین ۱ تا ۸۰۰۰ نویسه باشد.'), { status: 400, code: 'invalid_message' })
  }

  const now = Date.now()
  let chat
  if (channel === 'telegram') {
    chat = await env.DB.prepare("SELECT id, title FROM chats WHERE user_id = ? AND channel = 'telegram' ORDER BY updated_at DESC LIMIT 1").bind(userId).first()
  } else if (chatId) {
    chat = await env.DB.prepare('SELECT id, title FROM chats WHERE id = ? AND user_id = ? AND channel = ?').bind(chatId, userId, 'web').first()
    if (!chat) throw Object.assign(new Error('گفت‌وگو پیدا نشد.'), { status: 404, code: 'chat_not_found' })
  }

  if (!chat) {
    const id = randomId()
    const title = channel === 'telegram' ? 'گفت‌وگوی تلگرام' : message.trim().slice(0, 48)
    await env.DB.prepare('INSERT INTO chats(id, user_id, title, channel, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, userId, title, channel, now, now).run()
    chat = { id, title }
  }

  const previous = await env.DB.prepare("SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT 16")
    .bind(chat.id).all()
  const history = (previous.results || []).reverse().slice(-8).map(({ role, content }) => ({ role, content: content.slice(-2_000) }))
  const promptMessages = [
    { role: 'system', content: 'You are AetherOps, a careful and helpful multilingual assistant. Detect the language of the latest user message and reply in that same language. This applies even if the website interface is set to another language. Supported primary languages: Persian, English, Arabic, Turkish, French, Spanish, German, Russian, Simplified Chinese, Japanese, Korean, Hindi, Urdu, Portuguese, Italian, Indonesian, Bengali, Dutch, Swedish, and Polish. If the user explicitly requests a different response language, follow that request. Do not switch to English unless the user writes in English or asks for English. Keep answers clear and concise.' },
    ...history,
    { role: 'user', content: message.trim() },
  ]
  const promptTokens = estimateTokens(JSON.stringify(promptMessages))
  await enforceDailyLimit(env, promptTokens + 1_024)

  const result = await env.AI.run(model, { messages: promptMessages, max_tokens: 1024 })
  const answer = typeof result === 'string' ? result : result?.response
  if (typeof answer !== 'string' || !answer.trim()) throw Object.assign(new Error('مدل پاسخ قابل‌نمایشی برنگرداند.'), { status: 502, code: 'empty_model_response' })
  const inputTokens = Number(result?.usage?.prompt_tokens) || promptTokens
  const outputTokens = Number(result?.usage?.completion_tokens) || estimateTokens(answer)
  const totalNow = Date.now()

  await env.DB.batch([
    env.DB.prepare('INSERT INTO messages(id, chat_id, role, content, model, created_at, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(randomId(), chat.id, 'user', message.trim(), model, totalNow - 1, inputTokens, 0),
    env.DB.prepare('INSERT INTO messages(id, chat_id, role, content, model, created_at, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(randomId(), chat.id, 'assistant', answer.trim(), model, totalNow, 0, outputTokens),
    env.DB.prepare('UPDATE chats SET updated_at = ? WHERE id = ? AND user_id = ?').bind(totalNow, chat.id, userId),
    env.DB.prepare('INSERT INTO usage_daily(user_id, day_utc, input_tokens, output_tokens, requests) VALUES (?, ?, ?, ?, 1) ON CONFLICT(user_id, day_utc) DO UPDATE SET input_tokens=input_tokens+excluded.input_tokens, output_tokens=output_tokens+excluded.output_tokens, requests=requests+1')
      .bind(userId, utcDay(), inputTokens, outputTokens),
  ])
  return { chatId: chat.id, title: chat.title, answer: answer.trim(), model, usage: { inputTokens, outputTokens } }
}

export async function chat(request, env, user) {
  requireSameOrigin(request)
  await requireChannelMembership(env, user.id)
  const body = await readJson(request, 12_000)
  try {
    const result = await generateReply(env, { userId: user.id, chatId: body.chatId || null, message: body.message, model: body.model || '@cf/google/gemma-4-26b-a4b-it' })
    return json(result)
  } catch (cause) {
    const safeCodes = new Set(['daily_quota_reached', 'model_not_allowed', 'invalid_message', 'chat_not_found'])
    if (!safeCodes.has(cause.code)) {
      console.error('workers_ai_failed', cause?.name || 'Error')
      return error('مدل هوش مصنوعی فعلاً پاسخ‌گو نیست. کمی بعد دوباره تلاش کن.', 502, 'inference_failed')
    }
    return error(cause.message, cause.status || 400, cause.code)
  }
}

export async function usage(request, env, user) {
  return json(await getUsage(env, user.id))
}
