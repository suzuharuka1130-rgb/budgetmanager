// LINE Messaging API（push）への送信を担う共有ヘルパー。
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getSecretKey } from './keys.ts'

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
  let key: string
  try {
    key = getSecretKey()
  } catch {
    // シークレットキーがない場合はフォールバック
    return defaultTargets;
  }
  if (!url) return defaultTargets;

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

// 全世帯のIDを返す（service role 前提）
export async function listHouseholdIds(sb: { from: (t: string) => any }): Promise<string[]> {
  const { data, error } = await sb.from('households').select('id')
  if (error) throw error
  return (data ?? []).map((h: { id: string }) => h.id)
}

// ある世帯の通知対象LINE IDを返す（line_user_id があり、通知設定が有効なメンバー）
export async function householdLineRecipients(
  sb: { from: (t: string) => any },
  householdId: string,
  preferenceKey: 'monthly_report' | 'monthly_reminder' | 'credit_input_reminder',
): Promise<string[]> {
  const { data: members, error: membersError } = await sb
    .from('household_members')
    .select('user_id, line_user_id')
    .eq('household_id', householdId)
  if (membersError) throw membersError
  const withLine = (members ?? []).filter((m: { line_user_id?: string }) => !!m.line_user_id)
  if (!withLine.length) return []
  const { data: prefs, error: prefsError } = await sb
    .from('notification_preferences')
    .select('user_id, monthly_report, monthly_reminder, credit_input_reminder')
    .in('user_id', withLine.map((m: { user_id: string }) => m.user_id))
  if (prefsError) throw prefsError
  const prefMap = new Map((prefs ?? []).map((p: { user_id: string }) => [p.user_id, p]))
  return withLine
    .filter((m: { user_id: string }) => {
      const p = prefMap.get(m.user_id) as Record<string, boolean> | undefined
      return p ? p[preferenceKey] !== false : true // 設定がなければ既定ON
    })
    .map((m: { line_user_id: string }) => m.line_user_id)
}

// カスタム通知の送信対象LINE IDを返す（custom_notification_prefs に行なし = 既定ON）
export async function customNotificationRecipients(
  sb: { from: (t: string) => any },
  householdId: string,
  notificationId: string,
): Promise<string[]> {
  const { data: members, error: membersError } = await sb
    .from('household_members')
    .select('user_id, line_user_id')
    .eq('household_id', householdId)
  if (membersError) throw membersError
  const withLine = (members ?? []).filter((m: { line_user_id?: string }) => !!m.line_user_id)
  if (!withLine.length) return []
  const { data: prefs, error: prefsError } = await sb
    .from('custom_notification_prefs')
    .select('user_id, enabled')
    .eq('notification_id', notificationId)
    .in('user_id', withLine.map((m: { user_id: string }) => m.user_id))
  if (prefsError) throw prefsError
  const prefMap = new Map((prefs ?? []).map((p: { user_id: string; enabled: boolean }) => [p.user_id, p.enabled]))
  return withLine
    .filter((m: { user_id: string }) => prefMap.get(m.user_id) !== false)
    .map((m: { line_user_id: string }) => m.line_user_id)
}

// LINE Messaging API へ 1 メッセージオブジェクトを各ユーザーへ個別 push する共通処理
async function pushMessage(
  message: Record<string, unknown>,
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
        body: JSON.stringify({ to: userId, messages: [message] }),
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

/**
 * 指定メッセージを各ユーザーへ個別に push 送信する。
 * userIds を渡さない場合は環境変数（ME / WIFE）から取得する。
 */
export async function sendLineMessage(
  message: string,
  userIds?: string[],
): Promise<SendResult[]> {
  return pushMessage({ type: 'text', text: message }, userIds)
}

/**
 * Flex Message を各ユーザーへ個別に push 送信する。
 * userIds を渡さない場合は環境変数（ME / WIFE）から取得する。
 */
export async function sendLineFlexMessage(
  altText: string,
  contents: Record<string, unknown>,
  userIds?: string[],
): Promise<SendResult[]> {
  return pushMessage({ type: 'flex', altText, contents }, userIds)
}

/**
 * 複数行のレポート本文 + アプリを開くボタンを持つ Flex Message（bubble）を組み立てる。
 * Flex の text コンポーネントは改行を解釈しないため、行ごとに分割してスタックする。
 * 空行は高さを保つためゼロ幅スペースに置き換える。
 */
export function buildAppLinkFlexContents(bodyText: string, appUrl: string): Record<string, unknown> {
  const lines = bodyText.split('\n')
  return {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      contents: lines.map((line) => ({
        type: 'text',
        text: line === '' ? '​' : line,
        size: 'sm',
        wrap: true,
      })),
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#166534',
          action: { type: 'uri', label: 'Kakeiboを開く', uri: appUrl },
        },
      ],
    },
  }
}
