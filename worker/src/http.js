const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...securityHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })
}

export function error(message, status = 400, code = 'bad_request') {
  return json({ error: { code, message } }, status)
}

export async function readJson(request, maximumBytes = 16_000) {
  const declared = Number(request.headers.get('content-length') || 0)
  if (declared > maximumBytes) throw Object.assign(new Error('درخواست بیش از اندازه بزرگ است.'), { status: 413, code: 'payload_too_large' })
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > maximumBytes) throw Object.assign(new Error('درخواست بیش از اندازه بزرگ است.'), { status: 413, code: 'payload_too_large' })
  try { return JSON.parse(text || '{}') } catch { throw Object.assign(new Error('بدنهٔ درخواست معتبر نیست.'), { status: 400, code: 'invalid_json' }) }
}

export function requireSameOrigin(request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    throw Object.assign(new Error('درخواست از مبدأ مجاز ارسال نشده است.'), { status: 403, code: 'origin_rejected' })
  }
}

export function getCookie(request, name) {
  const header = request.headers.get('cookie') || ''
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator > 0 && part.slice(0, separator).trim() === name) return decodeURIComponent(part.slice(separator + 1).trim())
  }
  return ''
}

export function sessionCookie(request, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:'
  const name = secure ? '__Host-aether_session' : 'aether_session'
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
}

export function responseSecurityHeaders(response) {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value)
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
