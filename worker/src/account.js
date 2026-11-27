import { randomId, randomToken, sha256 } from './crypto.js'
import { authenticate } from './auth.js'
import { error, json, readJson, requireSameOrigin } from './http.js'
import { channelStatus } from './channel.js'

export async function listChats(env, user) {
  const result = await env.DB.prepare('SELECT id, title, channel, created_at AS createdAt, updated_at AS updatedAt FROM chats WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100').bind(user.id).all()
  return json({ chats: result.results || [] })
}

export async function createChat(request, env, user) {
  requireSameOrigin(request)
  const body = await readJson(request, 2_000)
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : 'گفت‌وگوی تازه'
  const id = randomId()
  const now = Date.now()
  await env.DB.prepare("INSERT INTO chats(id, user_id, title, channel, created_at, updated_at) VALUES (?, ?, ?, 'web', ?, ?)")
    .bind(id, user.id, title || 'گفت‌وگوی تازه', now, now).run()
  return json({ chat: { id, title: title || 'گفت‌وگوی تازه', channel: 'web', createdAt: now, updatedAt: now } }, 201)
}

export async function getChat(env, user, id) {
  const chat = await env.DB.prepare("SELECT id, title, channel, created_at AS createdAt, updated_at AS updatedAt FROM chats WHERE id = ? AND user_id = ? AND channel = 'web'").bind(id, user.id).first()
  if (!chat) return error('گفت‌وگو پیدا نشد.', 404, 'chat_not_found')
  const result = await env.DB.prepare('SELECT id, role, content, model, created_at AS createdAt, input_tokens AS inputTokens, output_tokens AS outputTokens FROM messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT 200').bind(id).all()
  return json({ chat, messages: result.results || [] })
}

export async function deleteChat(request, env, user, id) {
  requireSameOrigin(request)
  const result = await env.DB.prepare("DELETE FROM chats WHERE id = ? AND user_id = ? AND channel = 'web'").bind(id, user.id).run()
  if (!result.meta.changes) return error('گفت‌وگو پیدا نشد.', 404, 'chat_not_found')
  return json({ ok: true })
}

export async function listTokens(env, user) {
  const result = await env.DB.prepare('SELECT id, name, prefix, created_at AS createdAt, last_used_at AS lastUsedAt FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC').bind(user.id).all()
  return json({ tokens: result.results || [] })
}

export async function createToken(request, env, user) {
  requireSameOrigin(request)
  const body = await readJson(request, 2_000)
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : ''
  if (!name) return error('برای توکن یک نام بنویس.', 400, 'token_name_required')
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM api_tokens WHERE user_id = ?').bind(user.id).first()
  if ((count?.count || 0) >= 10) return error('حداکثر ۱۰ توکن برای هر حساب می‌توان ساخت.', 429, 'token_limit_reached')
  const raw = `aop_${randomToken(32)}`
  const id = randomId()
  const now = Date.now()
  await env.DB.prepare('INSERT INTO api_tokens(id, user_id, name, token_hash, prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, user.id, name, await sha256(raw), `${raw.slice(0, 12)}••••`, now).run()
  return json({ token: { id, name, prefix: `${raw.slice(0, 12)}••••`, createdAt: now }, secret: raw }, 201)
}

export async function revokeToken(request, env, user, id) {
  requireSameOrigin(request)
  const result = await env.DB.prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?').bind(id, user.id).run()
  if (!result.meta.changes) return error('توکن پیدا نشد.', 404, 'token_not_found')
  return json({ ok: true })
}

export async function linkCode(request, env, user) {
  requireSameOrigin(request)
  const now = Date.now()
  await env.DB.prepare('DELETE FROM telegram_link_codes WHERE user_id = ? OR expires_at < ?').bind(user.id, now).run()
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = randomToken(9).toUpperCase()
    const codeHash = await sha256(code)
    try {
      await env.DB.prepare('INSERT INTO telegram_link_codes(code_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(codeHash, user.id, now + 10 * 60 * 1000, now).run()
      return json({ code, expiresInSeconds: 600, instructions: `/start ${code}`, botUrl: `https://t.me/AetherOpsChatBot?start=${code}` }, 201)
    } catch {
      // A collision is very unlikely; retry with fresh random bytes.
    }
  }
  return error('ساخت کد اتصال انجام نشد؛ دوباره تلاش کن.', 503, 'link_code_failed')
}

export async function unlinkTelegram(request, env, user) {
  requireSameOrigin(request)
  await env.DB.prepare('DELETE FROM telegram_links WHERE user_id = ?').bind(user.id).run()
  return json({ ok: true })
}

export async function accountRoutes(request, env, path) {
  const user = await authenticate(request, env)
  if (!user) return error('برای ادامه وارد حساب شو.', 401, 'unauthenticated')
  if (user.tokenId) return error('توکن API فقط برای چت و مشاهدهٔ مصرف دسترسی دارد.', 403, 'api_token_scope_denied')
  if (path === '/api/chats' && request.method === 'GET') return listChats(env, user)
  if (path === '/api/chats' && request.method === 'POST') return createChat(request, env, user)
  if (path === '/api/tokens' && request.method === 'GET') return listTokens(env, user)
  if (path === '/api/tokens' && request.method === 'POST') return createToken(request, env, user)
  if (path === '/api/channel/status' && request.method === 'GET') return json(await channelStatus(env, user.id))
  if (path === '/api/telegram/link-code' && request.method === 'POST') return linkCode(request, env, user)
  if (path === '/api/telegram/link' && request.method === 'DELETE') return unlinkTelegram(request, env, user)

  const chatMatch = path.match(/^\/api\/chats\/([\w-]+)$/)
  if (chatMatch && request.method === 'GET') return getChat(env, user, chatMatch[1])
  if (chatMatch && request.method === 'DELETE') return deleteChat(request, env, user, chatMatch[1])
  const tokenMatch = path.match(/^\/api\/tokens\/([\w-]+)$/)
  if (tokenMatch && request.method === 'DELETE') return revokeToken(request, env, user, tokenMatch[1])
  return error('مسیر API پیدا نشد.', 404, 'not_found')
}
