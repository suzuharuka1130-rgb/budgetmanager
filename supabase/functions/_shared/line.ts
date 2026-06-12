// LINE Messaging API（push）への送信を担う共有ヘルパー。
import { createClient } from 'jsr:@supabase/supabase-js@2'

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push'

export interface SendResult {
  userId: string
  ok: boolean
  status: number
  error?: string
}

// 環境変数から送信先ユーザーIDを取得（ME は必須、WIFE は任意）
export function getConfiguredUserIds(): string[] {
  const me = Deno.env.get('LINE_USER_ID_ME')?.trim()
  const wife = Deno.env.get('LINE_USER_ID_WIFE')?.trim()
  return [me, wife].filter((id): id is string => !!id)
}

/**
 * ユーザーの通知設定に基づいて、送信対象の LINE ユーザーID をフィルタリングして返す。
 */
export async function getFilteredLineUserIds(
  preferenceKey: 'monthly_report' | 'monthly_reminder' | 'credit_input_reminder',
): Promise<string[]> {
  const me = Deno.env.get('LINE_USER_ID_ME')?.trim()
  const wife = Deno.env.get('LINE_USER_ID_WIFE')?.trim()
  const defaultTargets = getConfiguredUserIds()

  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    // サービスロールキーがない場合はフォールバック
    return defaultTargets;
  }

  try {
    const supabase = createClient(url, key)
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers()
    if (authError || !authData?.users) {
      return defaultTargets;
    }

    const meEmail = (Deno.env.get('USER_EMAIL_ME') || 'suzu.haruka1130@gmail.com').trim().toLowerCase()
    const wifeEmail = (Deno.env.get('USER_EMAIL_WIFE') || '').trim().toLowerCase()

    const meUser = authData.users.find(u => u.email?.toLowerCase() === meEmail)
    const wifeUser = authData.users.find(u => u.email?.toLowerCase() === wifeEmail)

    const userIdsToFetch = [meUser?.id, wifeUser?.id].filter(Boolean) as string[]
    if (!userIdsToFetch.length) {
      return defaultTargets;
    }

    const { data: prefs, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('*')
      .in('user_id', userIdsToFetch)

    if (prefsError) {
      return defaultTargets;
    }

    const targets: string[] = []

    // 自分 (ME) の判定
    if (me) {
      const mePref = prefs?.find(p => p.user_id === meUser?.id)
      const isMeEnabled = mePref ? mePref[preferenceKey] : true
      if (isMeEnabled) {
        targets.push(me)
      }
    }

    // 妻 (WIFE) の判定
    if (wife) {
      const wifePref = prefs?.find(p => p.user_id === wifeUser?.id)
      const isWifeEnabled = wifePref ? wifePref[preferenceKey] : true
      if (isWifeEnabled) {
        targets.push(wife)
      }
    }

    return targets
  } catch {
    return defaultTargets;
  }
}

/**
 * 指定メッセージを各ユーザーへ個別に push 送信する。
 * userIds を渡さない場合は環境変数（ME / WIFE）から取得する。
 */
export async function sendLineMessage(
  message: string,
  userIds?: string[],
): Promise<SendResult[]> {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN が設定されていません。')

  const targets = userIds && userIds.length ? userIds : getConfiguredUserIds()
  if (!targets.length) {
    throw new Error('送信先のLINEユーザーIDが設定されていません（LINE_USER_ID_ME）。')
  }

  const results: SendResult[] = []
  for (const userId of targets) {
    try {
      const res = await fetch(LINE_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: userId,
          messages: [{ type: 'text', text: message }],
        }),
      })
      results.push({
        userId,
        ok: res.ok,
        status: res.status,
        error: res.ok ? undefined : await res.text(),
      })
    } catch (e) {
      results.push({ userId, ok: false, status: 0, error: String((e as Error)?.message ?? e) })
    }
  }
  return results
}
