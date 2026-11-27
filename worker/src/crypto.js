const encoder = new TextEncoder()

export function randomId() {
  return crypto.randomUUID()
}

export function randomToken(byteCount = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function randomCode(digits = 8) {
  const ceiling = 10 ** digits
  const limit = Math.floor(0x1_0000_0000 / ceiling) * ceiling
  let value
  do {
    value = crypto.getRandomValues(new Uint32Array(1))[0]
  } while (value >= limit)
  return String(value % ceiling).padStart(digits, '0')
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function safeEqual(left = '', right = '') {
  if (left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return result === 0
}
