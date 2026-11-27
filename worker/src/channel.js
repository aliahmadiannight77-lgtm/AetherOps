const CHANNEL_ID = '@PythonCodingAcademy'
const CHANNEL_URL = 'https://t.me/PythonCodingAcademy'
const BOT_URL = 'https://t.me/AetherOpsChatBot'

function unavailable() {
  return Object.assign(new Error('بررسی عضویت کانال در دسترس نیست.'), {
    status: 503,
    code: 'channel_check_unavailable',
  })
}

export async function isChannelMember(env, telegramUserId) {
  if (!env.TELEGRAM_BOT_TOKEN || !telegramUserId) throw unavailable()

  let response
  let body
  try {
    response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getChatMember`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: CHANNEL_ID, user_id: telegramUserId }),
    })
    body = await response.json()
  } catch {
    throw unavailable()
  }

  if (!response.ok || !body?.ok || !body.result) throw unavailable()
  const member = body.result
  return member.status === 'creator' || member.status === 'administrator' || member.status === 'member' ||
    (member.status === 'restricted' && member.is_member === true)
}

export async function channelStatus(env, userId) {
  const link = await env.DB.prepare('SELECT telegram_user_id FROM telegram_links WHERE user_id = ?').bind(userId).first()
  if (!link) {
    return {
      channelUrl: CHANNEL_URL,
      botUrl: BOT_URL,
      telegramLinked: false,
      isMember: false,
    }
  }
  return {
    channelUrl: CHANNEL_URL,
    botUrl: BOT_URL,
    telegramLinked: true,
    isMember: await isChannelMember(env, link.telegram_user_id),
  }
}

export async function requireChannelMembership(env, userId) {
  const link = await env.DB.prepare('SELECT telegram_user_id FROM telegram_links WHERE user_id = ?').bind(userId).first()
  if (!link) {
    throw Object.assign(new Error('برای بررسی عضویت، ابتدا تلگرام را به حساب خودت وصل کن.'), {
      status: 403,
      code: 'telegram_link_required',
    })
  }
  if (!(await isChannelMember(env, link.telegram_user_id))) {
    throw Object.assign(new Error('برای استفاده از AetherOps باید عضو کانال PythonCodingAcademy باشی.'), {
      status: 403,
      code: 'channel_membership_required',
    })
  }
}

export const requiredChannel = { id: CHANNEL_ID, url: CHANNEL_URL, botUrl: BOT_URL }
