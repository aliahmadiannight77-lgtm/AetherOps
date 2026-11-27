export async function api(path, { body, ...options } = {}) {
  const headers = new Headers(options.headers || {})
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const isJson = (response.headers.get('content-type') || '').includes('application/json')
  const result = isJson ? await response.json().catch(() => ({})) : {}
  if (!isJson) throw new Error('Worker API در دسترس نیست؛ برای اجرای کامل از npm run dev:edge استفاده کن.')
  if (!response.ok) {
    const failure = new Error(result?.error?.message || 'ارتباط با سرویس انجام نشد.')
    failure.code = result?.error?.code || 'request_failed'
    failure.status = response.status
    throw failure
  }
  return result
}
