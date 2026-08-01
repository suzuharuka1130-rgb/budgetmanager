// cron専用エンドポイントの認証と、呼び出しユーザー本人の世帯特定を担う共有ヘルパー。
// 各関数は verify_jwt = false（ゲートウェイのJWT検証OFF）で動くため、
// これらが実質的に唯一の認証層になる。
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { getPublishableKey, getSecretKey } from './keys.ts'

export interface CallerContext {
  userId: string
  householdId: string
  lineUserId: string | null
}

// pg_cron からの呼び出しのみを許可する。cron.sql は apikey ヘッダーに
// secret キーを載せて送るので、ここと一致するかどうかで判定する
// （そうしないと URL さえ知っていれば誰でも全世帯へLINE送信・バックアップを起動できてしまう）。
export function isCronAuthorized(req: Request): boolean {
  const provided = req.headers.get('apikey') ?? ''
  if (!provided) return false
  try {
    return provided === getSecretKey()
  } catch {
    return false
  }
}

// 呼び出しユーザー本人の世帯ID・LINEユーザーIDを取得する（Authorization ヘッダーの
// セッションJWTを検証 → household_members を引く）。設定画面からのテスト送信・
// 手動バックアップなど、ユーザーとして呼ばれた場合に使う。
export async function getCallerContext(
  req: Request,
  sb: SupabaseClient,
): Promise<CallerContext | null> {
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth) return null
  const anon = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    getPublishableKey(),
    { global: { headers: { Authorization: auth } } },
  )
  const { data, error } = await anon.auth.getUser()
  if (error || !data?.user) return null
  const { data: mem } = await sb
    .from('household_members')
    .select('household_id, line_user_id')
    .eq('user_id', data.user.id)
    .limit(1)
  const row = mem?.[0]
  if (!row) return null
  return { userId: data.user.id, householdId: row.household_id, lineUserId: row.line_user_id ?? null }
}
