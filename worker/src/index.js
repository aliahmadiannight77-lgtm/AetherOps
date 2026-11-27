import { authenticate, currentUser, logout, requestCode, verifyCode } from './auth.js'
import { chat, getUsage } from './ai.js'
import { accountRoutes } from './account.js'
import { error, json, responseSecurityHeaders } from './http.js'
import { telegramWebhook } from './telegram.js'

async function route(request, env) {
  const { pathname } = new URL(request.url)
  if (pathname === '/api/health' && request.method === 'GET') return json({ ok: true, service: 'aetherops' })
  if (pathname === '/api/auth/request-code' && request.method === 'POST') return requestCode(request, env)
  if (pathname === '/api/auth/verify-code' && request.method === 'POST') return verifyCode(request, env)
  if (pathname === '/api/auth/logout' && request.method === 'POST') return logout(request, env)
  if (pathname === '/api/auth/me' && request.method === 'GET') return currentUser(request, env)
  if (pathname === '/api/telegram/webhook' && request.method === 'POST') return telegramWebhook(request, env)

  if (pathname.startsWith('/api/')) {
    if (pathname === '/api/ai/chat' && request.method === 'POST') {
      const user = await authenticate(request, env)
      return user ? chat(request, env, user) : error('برای ادامه وارد حساب شو.', 401, 'unauthenticated')
    }
    if (pathname === '/api/usage' && request.method === 'GET') {
      const user = await authenticate(request, env)
      return user ? json(await getUsage(env, user.id)) : error('برای ادامه وارد حساب شو.', 401, 'unauthenticated')
    }
    return accountRoutes(request, env, pathname)
  }

  if (env.ASSETS) return env.ASSETS.fetch(request)
  return error('صفحه پیدا نشد.', 404, 'not_found')
}

export default {
  async fetch(request, env) {
    try {
      const response = await route(request, env)
      return responseSecurityHeaders(response)
    } catch (cause) {
      console.error('request_failed', cause?.code || 'unhandled', cause?.message || 'unknown')
      return responseSecurityHeaders(error(cause.message || 'خطای داخلی رخ داد.', cause.status || 500, cause.code || 'internal_error'))
    }
  },
}
