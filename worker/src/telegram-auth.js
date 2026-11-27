import { isChannelMember } from './channel.js'
import { randomId, randomToken, safeEqual, sha256 } from './crypto.js'
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
