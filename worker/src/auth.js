import { sha256 } from './crypto.js'
import { error, getCookie, json, requireSameOrigin } from './http.js'

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
  const identity = await env.DB.prepare('SELECT username, display_name FROM telegram_accounts WHERE user_id = ?').bind(user.id).first()
  const displayName = identity?.username ? `@${identity.username}` : identity?.display_name || 'AetherOps user'
  return json({ user: {
    id: user.id,
    email: null,
    displayName,
    identityProvider: identity ? 'telegram' : 'legacy',
    telegramLinked: Boolean(linked),
  } })
}
