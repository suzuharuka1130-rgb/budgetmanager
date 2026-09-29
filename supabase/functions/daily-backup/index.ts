// 毎日 1:00 JST（前日 16:00 UTC）— 全テーブルを JSON にまとめて Google Drive にバックアップ。
// cron: secret キーで起動（全世帯分を1ファイルにバックアップ、全世帯にログを記録）。
// 手動（設定画面の「今すぐバックアップ」）: 認証ヘッダー付きで呼び出す。呼び出しユーザーの
//   世帯のデータだけを別名（kakeibo-manual-...）で保存し、その世帯にログを記録する。
//   手動分は日次バックアップとは別枠で保持件数を管理し、連打しても日次バックアップが
//   押し出されて消えないようにする（以前は30回押すと過去の日次バックアップが全て消えた）。
//
// ===== Google Drive セットアップ（OAuth リフレッシュトークン / 個人Gmail対応）=====
// サービスアカウントは個人Gmailのドライブに保存できない（容量割当なし）ため、
// ユーザー本人のOAuthでアップロードする（ファイルは本人所有・本人の容量を使用）。
//
// 1. Google Cloud Console → APIとサービス → OAuth同意画面 を構成
//    - User Type: 外部 / スコープに .../auth/drive を追加 / 自分のメールを「テストユーザー」に追加
// 2. 認証情報 → 認証情報を作成 → OAuthクライアントID → アプリの種類「ウェブアプリケーション」
//    - 承認済みリダイレクトURI に https://developers.google.com/oauthplayground を追加
//    - 発行された client_id と client_secret を控える
// 3. OAuth Playground（https://developers.google.com/oauthplayground）でリフレッシュトークン取得:
//    - 右上の歯車 → 「Use your own OAuth credentials」にチェック → client_id / client_secret を入力
//    - 左の入力欄にスコープ https://www.googleapis.com/auth/drive を入力 → Authorize APIs → 同意
//    - 「Exchange authorization code for tokens」→ 表示される refresh_token を控える
// 4. Supabase シークレットに登録:
//      supabase secrets set GOOGLE_OAUTH_CLIENT_ID="xxxx.apps.googleusercontent.com"
//      supabase secrets set GOOGLE_OAUTH_CLIENT_SECRET="GOCSPX-..."
//      supabase secrets set GOOGLE_OAUTH_REFRESH_TOKEN="1//0g..."
//    - GOOGLE_DRIVE_FOLDER_ID は任意（未設定なら本人ドライブに KakeiboBackups を自動作成）。
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { getSecretKey } from '../_shared/keys.ts'
import { getCallerContext, isCronAuthorized } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const BACKUP_TABLES = [
  'monthly_income',
  'card_expenses',
  'other_expenses',
  'account_balance',
  'cards',
  'other_expense_types',
  'app_settings',
  'households',
  'household_members',
]
const FOLDER_NAME = 'KakeiboBackups'
const FILE_PREFIX = 'kakeibo-backup-'
const KEEP_FILES = 30
const MANUAL_FILE_PREFIX = 'kakeibo-manual-'
const KEEP_MANUAL_FILES = 10
const MANUAL_COOLDOWN_MINUTES = 5

function getServiceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  if (!url) throw new Error('SUPABASE_URL が未設定です。')
  return createClient(url, getSecretKey())
}

// JST の YYYY-MM-DD
function backupDateJST(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const y = jst.getUTCFullYear()
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(jst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// JST の HHMMSS（手動バックアップのファイル名を1日に複数作れるようにする）
function backupTimeJST(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return [jst.getUTCHours(), jst.getUTCMinutes(), jst.getUTCSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join('')
}

// ---- Google OAuth 認証（リフレッシュトークン → アクセストークン）----
async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')?.trim()
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')?.trim()
  const refreshToken = Deno.env.get('GOOGLE_OAUTH_REFRESH_TOKEN')?.trim()
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN が未設定です。')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error('Googleアクセストークンの取得に失敗: ' + JSON.stringify(data))
  }
  return data.access_token as string
}

// KakeiboBackups フォルダID を取得（未設定なら検索、無ければ作成）
async function resolveFolderId(token: string): Promise<string> {
  const envId = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID')?.trim()
  if (envId) return envId

  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  )
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const listData = await listRes.json()
  if (listData.files?.length) return listData.files[0].id

  const createRes = await fetch(`https://www.googleapis.com/drive/v3/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  })
  const created = await createRes.json()
  if (!createRes.ok || !created.id) {
    throw new Error('Driveフォルダの作成に失敗: ' + JSON.stringify(created))
  }
  return created.id
}

// JSON文字列をフォルダにアップロード（multipart）
async function uploadJson(token: string, folderId: string, filename: string, content: string): Promise<void> {
  const boundary = '-------kakeibo' + crypto.randomUUID().replace(/-/g, '')
  const metadata = { name: filename, parents: [folderId] }
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    `--${boundary}\r\n` +
    'Content-Type: application/json\r\n\r\n' +
    content + '\r\n' +
    `--${boundary}--`

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )
  if (!res.ok) {
    throw new Error('Driveアップロードに失敗: ' + (await res.text()))
  }
}

// 古いバックアップを削除（prefix のファイルを新しい順に keep 件だけ残す）
async function pruneOldBackups(token: string, folderId: string, prefix: string, keep: number): Promise<void> {
  const q = encodeURIComponent(
    `'${folderId}' in parents and name contains '${prefix}' and trashed=false`,
  )
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&fields=files(id,name,createdTime)&pageSize=1000`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const data = await res.json()
  const files: { id: string }[] = data.files ?? []
  const toDelete = files.slice(keep)
  for (const f of toDelete) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  }
}

async function logBackup(
  sb: SupabaseClient,
  hids: string[],
  row: { status: string; filename: string | null; file_size: number | null; error_message: string | null },
): Promise<void> {
  const targets = hids.length ? hids : [null]
  const rows = targets.map((hid) => ({ ...row, household_id: hid }))
  await sb.from('backup_logs').insert(rows)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const sb = getServiceClient()

  // cron（secret キーの apikey）なら全世帯、そうでなければログイン済みユーザーの
  // 世帯のみを対象にする。どちらでもないリクエストは拒否する。
  let hid: string | null = null // null = cron（全世帯）
  let logHids: string[] = []
  try {
    if (isCronAuthorized(req)) {
      const { data: hs } = await sb.from('households').select('id')
      logHids = (hs ?? []).map((h: { id: string }) => h.id)
    } else {
      const caller = await getCallerContext(req, sb)
      if (!caller) return jsonResponse({ error: '認証が必要です。' }, 401)
      hid = caller.householdId
      logHids = [hid]

      // 連打防止: 同じ世帯の手動バックアップは数分に1回まで
      const since = new Date(Date.now() - MANUAL_COOLDOWN_MINUTES * 60 * 1000).toISOString()
      const { count } = await sb
        .from('backup_logs')
        .select('id', { count: 'exact', head: true })
        .eq('household_id', hid)
        .like('filename', `${MANUAL_FILE_PREFIX}%`)
        .gte('created_at', since)
      if ((count ?? 0) > 0) {
        return jsonResponse(
          { success: false, error: `手動バックアップは${MANUAL_COOLDOWN_MINUTES}分に1回までです。少し待ってからお試しください。` },
          429,
        )
      }
    }
  } catch (e) {
    return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500)
  }

  const isManual = hid !== null
  const filename = isManual
    ? `${MANUAL_FILE_PREFIX}${backupDateJST()}-${backupTimeJST()}.json`
    : `${FILE_PREFIX}${backupDateJST()}.json`

  try {
    // 1) テーブルを取得（手動は自世帯の行のみ）
    const tables: Record<string, unknown[]> = {}
    for (const t of BACKUP_TABLES) {
      let q = sb.from(t).select('*')
      if (isManual) q = q.eq(t === 'households' ? 'id' : 'household_id', hid)
      const { data, error } = await q
      if (error) throw new Error(`${t} の取得に失敗: ${error.message}`)
      tables[t] = data ?? []
    }
    const backup = { backup_date: backupDateJST(), version: '1.0', tables }
    const content = JSON.stringify(backup)
    const fileSize = new TextEncoder().encode(content).length

    // 2) Google Drive へアップロード
    const token = await getAccessToken()
    const folderId = await resolveFolderId(token)
    await uploadJson(token, folderId, filename, content)

    // 3) 古いバックアップを削除（日次30件・手動10件をそれぞれ別枠で保持）
    if (isManual) await pruneOldBackups(token, folderId, MANUAL_FILE_PREFIX, KEEP_MANUAL_FILES)
    else await pruneOldBackups(token, folderId, FILE_PREFIX, KEEP_FILES)

    // 4) 成功ログ
    await logBackup(sb, logHids, { status: 'success', filename, file_size: fileSize, error_message: null })
    return jsonResponse({ success: true, filename, file_size: fileSize })
  } catch (e) {
    const message = String((e as Error)?.message ?? e)
    try {
      await logBackup(sb, logHids, { status: 'error', filename, file_size: null, error_message: message })
    } catch { /* ログ失敗は握りつぶす */ }
    return jsonResponse({ success: false, error: message }, 500)
  }
})
