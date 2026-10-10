// ログイン中のユーザーの Google プロフィール写真を、保存済みリフレッシュトークンで取り直す。
// 呼び出し時に refreshToken があれば、そのユーザーの行へ保存してから問い合わせる。
// トークン自体はレスポンスに含めない。
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getServiceClient } from '../_shared/report.ts'
import { getPublishableKey } from '../_shared/keys.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

async function callerId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth) return null
  const anon = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    getPublishableKey(),
    { global: { headers: { Authorization: auth } } },
  )
  const { data, error } = await anon.auth.getUser()
  if (error || !data?.user) return null
  return data.user.id
}

async function currentPicture(refreshToken: string): Promise<string | null> {
  const clientId = Deno.env.get('GOOGLE_LOGIN_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_LOGIN_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('Google ログインのクライアント情報が未設定です。')

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  const token = await tokenRes.json().catch(() => ({}))
  if (!tokenRes.ok || !token.access_token) {
    if (token.error === 'invalid_grant') return null
    throw new Error('Google のトークン更新に失敗しました。')
  }

  const infoRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  const info = await infoRes.json().catch(() => ({}))
  if (!infoRes.ok) throw new Error('Google のプロフィール取得に失敗しました。')
  return typeof info.picture === 'string' && info.picture ? info.picture : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'POST のみ対応しています。' }, 405)

  try {
    const userId = await callerId(req)
    if (!userId) return jsonResponse({ error: '認証が必要です。' }, 401)

    const body = await req.json().catch(() => ({}))
    const incoming = typeof body?.refreshToken === 'string' ? body.refreshToken.trim() : ''
    if (incoming.length > 2048) return jsonResponse({ error: '不正なトークンです。' }, 400)

    const sb = getServiceClient()
    if (incoming) {
      const { error } = await sb.from('google_oauth_tokens').upsert({
        user_id: userId,
        refresh_token: incoming,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
    }

    const { data: row, error: readError } = await sb
      .from('google_oauth_tokens')
      .select('refresh_token')
      .eq('user_id', userId)
      .maybeSingle()
    if (readError) throw readError
    if (!row?.refresh_token) return jsonResponse({ picture: null })

    const picture = await currentPicture(row.refresh_token)
    if (!picture) {
      await sb.from('google_oauth_tokens').delete().eq('user_id', userId)
      return jsonResponse({ picture: null })
    }
    return jsonResponse({ picture })
  } catch (e) {
    return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
