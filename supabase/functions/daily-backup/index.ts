// 毎日 1:00 JST（前日 16:00 UTC）— 全テーブルを JSON にまとめて Google Drive にバックアップ。
// cron: service role で起動（全世帯分を1ファイルにバックアップ、全世帯にログを記録）。
// 手動（設定画面の「今すぐバックアップ」）: 認証ヘッダー付きで呼び出し、呼び出しユーザーの
//   世帯にログを記録する。
//
// ===== Google Drive セットアップ（サービスアカウント）=====
// 1. Google Cloud Console → 「IAMと管理」→「サービスアカウント」→ 新規作成
// 2. 作成したサービスアカウントの「鍵」タブ → JSON 鍵を作成・ダウンロード
// 3. JSON 内の client_email と private_key を Supabase のシークレットに登録:
//      supabase secrets set GOOGLE_CLIENT_EMAIL="xxxx@yyyy.iam.gserviceaccount.com"
//      supabase secrets set GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
//    （private_key は改行を \n のまま貼り付けてOK。本コードで実改行へ復元します）
// 4. Google Drive で「KakeiboBackups」フォルダを作成し、上記 client_email に「編集者」で共有。
//    そのフォルダのID（URLの /folders/ 以降）を GOOGLE_DRIVE_FOLDER_ID に登録:
//      supabase secrets set GOOGLE_DRIVE_FOLDER_ID="1AbC..."
//    ※ GOOGLE_DRIVE_FOLDER_ID 未設定でも初回に自動作成しますが、サービスアカウント所有の
//      フォルダは Drive UI から見えず容量制限もあるため、上記の共有フォルダ方式を推奨します。
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'
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

function getServiceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です。')
  return createClient(url, key)
}

// JST の YYYY-MM-DD
function backupDateJST(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const y = jst.getUTCFullYear()
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(jst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ---- Google サービスアカウント認証（RS256 JWT → アクセストークン）----
function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const bin = atob(body)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

async function getAccessToken(): Promise<string> {
  const clientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL')?.trim()
  const privateKey = Deno.env.get('GOOGLE_PRIVATE_KEY')
  if (!clientEmail || !privateKey) {
    throw new Error('GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY が未設定です。')
  }
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  const jwt = `${unsigned}.${base64url(sig)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error('Googleアクセストークンの取得に失敗: ' + JSON.stringify(data))
  }
  return data.access_token as string
}

const DRIVE_Q = 'supportsAllDrives=true&includeItemsFromAllDrives=true'

// KakeiboBackups フォルダID を取得（未設定なら検索、無ければ作成）
async function resolveFolderId(token: string): Promise<string> {
  const envId = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID')?.trim()
  if (envId) return envId

  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  )
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&${DRIVE_Q}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const listData = await listRes.json()
  if (listData.files?.length) return listData.files[0].id

  const createRes = await fetch(`https://www.googleapis.com/drive/v3/files?${DRIVE_Q}`, {
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
  const boundary = '-------kakeibo' + base64url(crypto.getRandomValues(new Uint8Array(12)).buffer)
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
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true`,
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

// 古いバックアップを削除（新しい順に KEEP_FILES 件だけ残す）
async function pruneOldBackups(token: string, folderId: string): Promise<void> {
  const q = encodeURIComponent(
    `'${folderId}' in parents and name contains '${FILE_PREFIX}' and trashed=false`,
  )
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&fields=files(id,name,createdTime)&pageSize=1000&${DRIVE_Q}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const data = await res.json()
  const files: { id: string }[] = data.files ?? []
  const toDelete = files.slice(KEEP_FILES)
  for (const f of toDelete) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?supportsAllDrives=true`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  }
}

// 呼び出しユーザーの世帯ID（手動実行のログ記録先）
async function callerHouseholdId(req: Request, sb: SupabaseClient): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth) return null
  const anon = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: auth } } },
  )
  const { data, error } = await anon.auth.getUser()
  if (error || !data?.user) return null
  const { data: mem } = await sb.from('household_members').select('household_id').eq('user_id', data.user.id).limit(1)
  return mem?.[0]?.household_id ?? null
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

  // ログ記録先の世帯を決定（手動: 呼び出しユーザーの世帯 / cron: 全世帯）
  let logHids: string[] = []
  try {
    const caller = await callerHouseholdId(req, sb)
    if (caller) {
      logHids = [caller]
    } else {
      const { data: hs } = await sb.from('households').select('id')
      logHids = (hs ?? []).map((h: { id: string }) => h.id)
    }
  } catch {
    logHids = []
  }

  const filename = `${FILE_PREFIX}${backupDateJST()}.json`

  try {
    // 1) 全テーブルを取得
    const tables: Record<string, unknown[]> = {}
    for (const t of BACKUP_TABLES) {
      const { data, error } = await sb.from(t).select('*')
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

    // 3) 古いバックアップを削除（30件保持）
    await pruneOldBackups(token, folderId)

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
