// LINE Webhook: メンバーがBotに連携コードを送信すると、その送信者のLINEユーザーIDを
// 該当メンバーに自動保存する。LINE Developers の Webhook URL に設定すること。
import { createClient } from 'jsr:@supabase/supabase-js@2'

const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply'

// x-line-signature を channel secret で検証（未設定なら検証スキップ）
async function verifySignature(body: string, signature: string | null): Promise<boolean> {
  const secret = Deno.env.get('LINE_CHANNEL_SECRET')
  if (!secret) return true
  if (!signature) return false
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))
  return expected === signature
}

async function reply(token: string, text: string) {
  const at = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')
  if (!at || !token) return
  await fetch(LINE_REPLY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${at}` },
    body: JSON.stringify({ replyToken: token, messages: [{ type: 'text', text }] }),
  }).catch(() => {})
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')
  const raw = await req.text()
  if (!(await verifySignature(raw, req.headers.get('x-line-signature')))) {
    return new Response('bad signature', { status: 401 })
  }
  let payload: { events?: any[] }
  try { payload = JSON.parse(raw) } catch { return new Response('ok') }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  for (const ev of payload.events ?? []) {
    if (ev.type !== 'message' || ev.message?.type !== 'text') continue
    const userId = ev.source?.userId
    const code = String(ev.message.text || '').trim().toUpperCase()
    if (!userId || !code) continue

    const { data: members } = await sb
      .from('household_members')
      .select('id, line_link_expires')
      .eq('line_link_code', code)
    const m = (members ?? []).find(
      (x: { line_link_expires?: string }) => !x.line_link_expires || new Date(x.line_link_expires) > new Date(),
    )

    if (m) {
      await sb.from('household_members')
        .update({ line_user_id: userId, line_link_code: null, line_link_expires: null })
        .eq('id', m.id)
      await reply(ev.replyToken, '✅ LINE連携が完了しました。通知を受け取れます。')
    } else {
      await reply(ev.replyToken, '連携コードが無効か期限切れです。アプリで再発行してください。')
    }
  }

  return new Response('ok')
})
