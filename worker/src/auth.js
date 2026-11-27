import { hmac, randomCode, randomId, randomToken, safeEqual, sha256 } from './crypto.js'
import { error, getCookie, json, readJson, requireSameOrigin, sessionCookie } from './http.js'

const OTP_TTL_MS = 10 * 60 * 1000
const OTP_RESEND_MS = 60 * 1000
const OTP_MAX_ATTEMPTS = 5
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

export async function consumeRateLimit(env, scope, subject, maximum, windowMs) {
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs
  const result = await env.DB.prepare(`INSERT INTO rate_limits(scope, subject, window_start, hits) VALUES (?, ?, ?, 1)
    ON CONFLICT(scope, subject) DO UPDATE SET
      hits = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.hits + 1 ELSE 1 END,
      window_start = excluded.window_start
    RETURNING hits`)
    .bind(scope, subject, windowStart).first()
  return (result?.hits || 0) <= maximum
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return ''
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ''
  return email
}

function allowedEmails(env) {
  return (env.VERIFIED_LOGIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean)
}

export async function requestCode(request, env) {
  requireSameOrigin(request)
  if (!env.DB || !env.EMAIL || !env.AUTH_PEPPER || !env.MAIL_FROM) return error('سرویس ورود هنوز پیکربندی نشده است.', 503, 'auth_not_configured')
  const { email: input } = await readJson(request, 2_000)
  const email = normalizeEmail(input)
  if (!email) return error('نشانی ایمیل معتبر وارد کن.', 400, 'invalid_email')
  if (!allowedEmails(env).includes(email)) return error('در نسخهٔ رایگان، فقط ایمیل‌هایی که در Cloudflare تأیید شده‌اند امکان ورود دارند.', 403, 'verified_email_required')

  const ip = request.headers.get('cf-connecting-ip') || 'unknown'
  if (!(await consumeRateLimit(env, 'otp_ip_hour', ip, 10, 60 * 60 * 1000))) return error('تعداد درخواست‌ها از این اتصال بیش از حد است.', 429, 'otp_ip_rate_limited')
  if (!(await consumeRateLimit(env, 'otp_email_minute', email, 1, OTP_RESEND_MS))) return error('کمی صبر کن و دوباره تلاش کن.', 429, 'otp_rate_limited')

  const now = Date.now()
  await env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - 24 * 60 * 60 * 1000).run()

  const code = randomCode(8)
  const codeHash = await hmac(`${email}:${code}`, env.AUTH_PEPPER)
  await env.DB.prepare('INSERT INTO otp_challenges(email, code_hash, created_at, expires_at, attempts) VALUES (?, ?, ?, ?, 0) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, created_at=excluded.created_at, expires_at=excluded.expires_at, attempts=0')
    .bind(email, codeHash, now, now + OTP_TTL_MS).run()

  try {
    await env.EMAIL.send({
      to: email,
      from: env.MAIL_FROM,
      subject: 'کد ورود AetherOps',
      text: `کد ورود شما: ${code}\n\nاین کد تا ۱۰ دقیقه معتبر است. اگر این درخواست را نداده‌اید، این ایمیل را نادیده بگیرید.`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif"><h2>ورود به AetherOps</h2><p>کد یک‌بارمصرف شما:</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold">${code}</p><p>این کد تا ۱۰ دقیقه معتبر است.</p></div>`,
    })
  } catch (cause) {
    await env.DB.prepare('DELETE FROM otp_challenges WHERE email = ? AND code_hash = ?').bind(email, codeHash).run()
    console.error('otp_delivery_failed', cause?.code || 'unknown')
    return error('ارسال ایمیل انجام نشد. پیکربندی دامنه و نشانی تأییدشده را بررسی کن.', 503, 'email_delivery_failed')
  }
  return json({ ok: true, expiresInSeconds: OTP_TTL_MS / 1000 })
}

export async function verifyCode(request, env) {
  requireSameOrigin(request)
  if (!env.DB || !env.AUTH_PEPPER) return error('سرویس ورود هنوز پیکربندی نشده است.', 503, 'auth_not_configured')
  const { email: input, code } = await readJson(request, 2_000)
  const email = normalizeEmail(input)
  if (!email || typeof code !== 'string' || !/^\d{8}$/.test(code)) return error('ایمیل یا کد معتبر نیست.', 400, 'invalid_code')
  if (!allowedEmails(env).includes(email)) return error('این نشانی ایمیل در فهرست تأییدشده نیست.', 403, 'verified_email_required')

  const challenge = await env.DB.prepare('SELECT code_hash, expires_at, attempts FROM otp_challenges WHERE email = ?').bind(email).first()
  if (!challenge || challenge.expires_at < Date.now() || challenge.attempts >= OTP_MAX_ATTEMPTS) return error('کد منقضی شده یا دیگر معتبر نیست.', 401, 'otp_expired')
  const candidate = await hmac(`${email}:${code}`, env.AUTH_PEPPER)
  if (!safeEqual(candidate, challenge.code_hash)) {
    await env.DB.prepare('UPDATE otp_challenges SET attempts = attempts + 1 WHERE email = ?').bind(email).run()
    return error('کد واردشده درست نیست.', 401, 'otp_invalid')
  }

  const now = Date.now()
  const userId = randomId()
  await env.DB.prepare('INSERT INTO users(id, email, created_at, last_login_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET last_login_at=excluded.last_login_at')
    .bind(userId, email, now, now).run()
  const user = await env.DB.prepare('SELECT id, email FROM users WHERE email = ?').bind(email).first()
  const rawSession = randomToken(32)
  const tokenHash = await sha256(rawSession)
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(tokenHash, user.id, now, now + SESSION_TTL_SECONDS * 1000),
    env.DB.prepare('DELETE FROM otp_challenges WHERE email = ?').bind(email),
  ])
  const linked = await env.DB.prepare('SELECT 1 AS linked FROM telegram_links WHERE user_id = ?').bind(user.id).first()
  return json({ ok: true, user: { ...user, telegramLinked: Boolean(linked) } }, 200, { 'Set-Cookie': sessionCookie(request, rawSession, SESSION_TTL_SECONDS) })
}

export async function logout(request, env) {
  requireSameOrigin(request)
  const token = getCookie(request, '__Host-aether_session') || getCookie(request, 'aether_session')
  if (token && env.DB) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
  const secure = new URL(request.url).protocol === 'https:'
  const name = secure ? '__Host-aether_session' : 'aether_session'
  return json({ ok: true }, 200, { 'Set-Cookie': `${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}` })
}

export async function authenticate(request, env) {
  if (!env.DB) return null
  const authorization = request.headers.get('authorization') || ''
  if (authorization.startsWith('Bearer ')) {
    const rawToken = authorization.slice(7).trim()
    if (!rawToken || rawToken.length > 160) return null
    const tokenHash = await sha256(rawToken)
    const record = await env.DB.prepare('SELECT users.id, users.email, api_tokens.id AS token_id FROM api_tokens JOIN users ON users.id=api_tokens.user_id WHERE api_tokens.token_hash = ?').bind(tokenHash).first()
    if (record) {
      await env.DB.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').bind(Date.now(), record.token_id).run()
      return { id: record.id, email: record.email, tokenId: record.token_id }
    }
    return null
  }
  const rawSession = getCookie(request, '__Host-aether_session') || getCookie(request, 'aether_session')
  if (!rawSession) return null
  return env.DB.prepare('SELECT users.id, users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?')
    .bind(await sha256(rawSession), Date.now()).first()
}

export async function currentUser(request, env) {
  const user = await authenticate(request, env)
  if (!user) return error('برای ادامه وارد حساب شو.', 401, 'unauthenticated')
  const linked = await env.DB.prepare('SELECT 1 AS linked FROM telegram_links WHERE user_id = ?').bind(user.id).first()
  return json({ user: { id: user.id, email: user.email, telegramLinked: Boolean(linked) } })
}
