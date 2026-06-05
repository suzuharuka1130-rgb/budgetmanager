// LINE Messaging API（push）への送信を担う共有ヘルパー。

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
