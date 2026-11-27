import { isChannelMember } from './channel.js'
import { consumeRateLimit } from './auth.js'
import { randomCode, randomId, randomToken, safeEqual, sha256 } from './crypto.js'
import { error, json, readJson, requireSameOrigin, sessionCookie } from './http.js'

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
const encoder = new TextEncoder()

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hmacBytes(keyBytes, value) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', key, encoder.encode(value))
}

async function verifyInitData(initData, botToken) {
  if (typeof initData !== 'string' || initData.length < 1 || initData.length > 8_192) return null
  const params = new URLSearchParams(initData)
  const entries = [...params.entries()]
  if (entries.length < 3 || new Set(entries.map(([key]) => key)).size !== entries.length) return null
  const receivedHash = params.get('hash') || ''
  if (!/^[a-f0-9]{64}$/i.test(receivedHash)) return null

  const dataCheckString = entries
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = await hmacBytes(encoder.encode('WebAppData'), botToken)
  const calculatedHash = hex(await hmacBytes(secretKey, dataCheckString))
  if (!safeEqual(calculatedHash, receivedHash.toLowerCase())) return null

  const authDate = Number(params.get('auth_date'))
  const now = Math.floor(Date.now() / 1_000)
  if (!Number.isSafeInteger(authDate) || authDate > now + 60 || now - authDate > 5 * 60) return null

  try {
    const user = JSON.parse(params.get('user') || 'null')
    if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || user.is_bot) return null
    return user
  } catch {
    return null
  }
}

function displayNameFor(user) {
  const name = [user.first_name, user.last_name].filter((part) => typeof part === 'string').join(' ').trim()
  return (name || (typeof user.username === 'string' ? `@${user.username}` : 'Telegram user')).slice(0, 100)
}

async function createTelegramSession(request, env, telegramUser) {
  const telegramUserId = String(telegramUser.id)
  const username = typeof telegramUser.username === 'string' ? telegramUser.username.slice(0, 64) : null
  const displayName = displayNameFor(telegramUser)
  const now = Date.now()

  const identity = await env.DB.prepare('SELECT user_id FROM telegram_accounts WHERE telegram_user_id = ?').bind(telegramUserId).first()
  const legacyLink = identity ? null : await env.DB.prepare('SELECT user_id FROM telegram_links WHERE telegram_user_id = ?').bind(telegramUserId).first()
  let userId = identity?.user_id || legacyLink?.user_id

  if (userId) {
    const occupied = await env.DB.prepare('SELECT telegram_user_id FROM telegram_accounts WHERE user_id = ?').bind(userId).first()
    if (occupied && occupied.telegram_user_id !== telegramUserId) {
      return error('این حساب وب به یک حساب تلگرام دیگر متصل است.', 409, 'telegram_account_conflict')
    }
  } else {
    const syntheticEmail = `telegram-${telegramUserId}@users.aetherops.invalid`
    const candidateId = randomId()
    await env.DB.prepare('INSERT INTO users(id, email, created_at, last_login_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING')
      .bind(candidateId, syntheticEmail, now, now).run()
    const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(syntheticEmail).first()
    userId = user.id
  }

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO telegram_accounts(telegram_user_id, user_id, username, display_name, linked_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET username=excluded.username, display_name=excluded.display_name, updated_at=excluded.updated_at`)
      .bind(telegramUserId, userId, username, displayName, now, now),
    env.DB.prepare(`INSERT INTO telegram_links(user_id, telegram_user_id, telegram_chat_id, linked_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET telegram_user_id=excluded.telegram_user_id, telegram_chat_id=excluded.telegram_chat_id, linked_at=excluded.linked_at`)
      .bind(userId, telegramUserId, telegramUserId, now),
    env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(now, userId),
  ])

  const rawSession = randomToken(32)
  const tokenHash = await sha256(rawSession)
  await env.DB.prepare('INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, userId, now, now + SESSION_TTL_SECONDS * 1_000).run()

  return json({
    ok: true,
    user: { id: userId, email: null, displayName, identityProvider: 'telegram', telegramLinked: true },
  }, 200, { 'Set-Cookie': sessionCookie(request, rawSession, SESSION_TTL_SECONDS) })
}

export async function telegramAuth(request, env) {
  requireSameOrigin(request)
  if (!env.DB || !env.TELEGRAM_BOT_TOKEN) return error('ورود تلگرام فعلاً پیکربندی نشده است.', 503, 'telegram_auth_not_configured')
  const { initData } = await readJson(request, 10_000)
  const telegramUser = await verifyInitData(initData, env.TELEGRAM_BOT_TOKEN)
  if (!telegramUser) return error('اطلاعات ورود تلگرام معتبر یا تازه نیست؛ Mini App را دوباره باز کن.', 401, 'telegram_auth_invalid')

  let member
  try {
    member = await isChannelMember(env, String(telegramUser.id))
  } catch (cause) {
    return error(cause.message, cause.status || 503, cause.code || 'channel_check_unavailable')
  }
  if (!member) return error('برای ورود به AetherOps ابتدا عضو کانال PythonCodingAcademy شو و سپس دوباره تلاش کن.', 403, 'channel_membership_required')
  return createTelegramSession(request, env, telegramUser)
}

function validState(state) {
  return typeof state === 'string' && /^[A-Za-z0-9_-]{32}$/.test(state)
}

export async function createTelegramLoginChallenge(request, env) {
  requireSameOrigin(request)
  if (!env.DB) return error('ورود تلگرام فعلاً پیکربندی نشده است.', 503, 'telegram_auth_not_configured')
  const ip = request.headers.get('cf-connecting-ip') || 'unknown'
  if (!(await consumeRateLimit(env, 'telegram_login_start_ip', ip, 10, 60 * 60 * 1_000))) {
    return error('تعداد درخواست‌های ورود زیاد است؛ کمی بعد دوباره تلاش کن.', 429, 'telegram_login_rate_limited')
  }
  const now = Date.now()
  await env.DB.prepare('DELETE FROM telegram_login_challenges WHERE expires_at < ?').bind(now).run()
  const state = randomToken(24)
  await env.DB.prepare('INSERT INTO telegram_login_challenges(state_hash, created_at, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(state), now, now + 10 * 60 * 1_000).run()
  return json({
    ok: true,
    state,
    expiresInSeconds: 600,
    botUrl: `https://t.me/AetherOpsChatBot?start=web_${state}`,
  }, 201)
}

export async function bindTelegramLoginChallenge(env, state, telegramUser) {
  if (!env.DB || !validState(state) || !telegramUser?.id) return false
  const now = Date.now()
  const stateHash = await sha256(state)
  const existing = await env.DB.prepare('SELECT telegram_user_id, expires_at FROM telegram_login_challenges WHERE state_hash = ?')
    .bind(stateHash).first()
  const telegramUserId = String(telegramUser.id)
  if (!existing || existing.expires_at < now || (existing.telegram_user_id && existing.telegram_user_id !== telegramUserId)) return false
  const username = typeof telegramUser.username === 'string' ? telegramUser.username.slice(0, 64) : null
  const displayName = displayNameFor(telegramUser)
  const update = await env.DB.prepare(`UPDATE telegram_login_challenges SET telegram_user_id = ?, username = ?, display_name = ?
    WHERE state_hash = ? AND expires_at >= ? AND (telegram_user_id IS NULL OR telegram_user_id = ?)`)
    .bind(telegramUserId, username, displayName, stateHash, now, telegramUserId).run()
  return Boolean(update.meta.changes)
}

export async function issueTelegramLoginCode(env, state, telegramUser) {
  if (!env.DB || !validState(state) || !telegramUser?.id) return null
  const telegramUserId = String(telegramUser.id)
  if (!(await consumeRateLimit(env, 'telegram_login_code_user', telegramUserId, 3, 10 * 60 * 1_000))) return null
  const now = Date.now()
  const stateHash = await sha256(state)
  const code = randomCode(8)
  const codeHash = await sha256(`${state}:${code}`)
  const result = await env.DB.prepare(`UPDATE telegram_login_challenges SET code_hash = ?, issued_at = ?, attempts = 0
    WHERE state_hash = ? AND telegram_user_id = ? AND expires_at >= ?`)
    .bind(codeHash, now, stateHash, telegramUserId, now).run()
  return result.meta.changes ? code : null
}

export async function verifyTelegramLoginCode(request, env) {
  requireSameOrigin(request)
  if (!env.DB) return error('ورود تلگرام فعلاً پیکربندی نشده است.', 503, 'telegram_auth_not_configured')
  const { state, code } = await readJson(request, 2_000)
  if (!validState(state) || typeof code !== 'string' || !/^\d{8}$/.test(code)) {
    return error('کد ورود معتبر نیست.', 400, 'telegram_login_invalid')
  }

  const ip = request.headers.get('cf-connecting-ip') || 'unknown'
  if (!(await consumeRateLimit(env, 'telegram_login_verify_ip', ip, 30, 10 * 60 * 1_000))) {
    return error('تلاش‌های ورود زیاد است؛ کمی بعد دوباره تلاش کن.', 429, 'telegram_login_rate_limited')
  }
  const stateHash = await sha256(state)
  const now = Date.now()
  const challenge = await env.DB.prepare(`SELECT code_hash, telegram_user_id, username, display_name, expires_at, attempts
    FROM telegram_login_challenges WHERE state_hash = ?`).bind(stateHash).first()
  if (!challenge || !challenge.telegram_user_id || !challenge.code_hash || challenge.expires_at < now || challenge.attempts >= 5) {
    return error('کد ورود منقضی شده است؛ فرایند را از سایت دوباره شروع کن.', 401, 'telegram_login_expired')
  }

  const candidate = await sha256(`${state}:${code}`)
  if (!safeEqual(candidate, challenge.code_hash)) {
    await env.DB.prepare('UPDATE telegram_login_challenges SET attempts = attempts + 1 WHERE state_hash = ? AND attempts < 5 AND expires_at >= ?')
      .bind(stateHash, now).run()
    return error('کد ورود درست نیست.', 401, 'telegram_login_invalid')
  }

  let member
  try {
    member = await isChannelMember(env, challenge.telegram_user_id)
  } catch (cause) {
    return error(cause.message, cause.status || 503, cause.code || 'channel_check_unavailable')
  }
  if (!member) return error('عضویت کانال تأیید نشد؛ عضو شو و کد تازه بگیر.', 403, 'channel_membership_required')

  const consumed = await env.DB.prepare(`DELETE FROM telegram_login_challenges WHERE state_hash = ? AND code_hash = ?
    AND expires_at >= ? AND attempts < 5 RETURNING telegram_user_id, username, display_name`)
    .bind(stateHash, challenge.code_hash, now).first()
  if (!consumed) return error('کد ورود منقضی شده یا قبلاً استفاده شده است.', 401, 'telegram_login_expired')

  const telegramId = Number(consumed.telegram_user_id)
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) return error('اطلاعات تلگرام معتبر نیست.', 400, 'telegram_login_invalid')
  return createTelegramSession(request, env, {
    id: telegramId,
    username: consumed.username,
    first_name: consumed.display_name || 'Telegram user',
  })
}
