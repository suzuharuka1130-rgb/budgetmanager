// Supabase の新旧APIキー形式を両対応で読み取る共有ヘルパー。
// 新形式（SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS）はJSON辞書
// （例: {"default": "sb_secret_..."}）。旧形式（SUPABASE_SERVICE_ROLE_KEY /
// SUPABASE_ANON_KEY）は文字列そのもの。新形式を優先し、無ければ旧形式へフォールバックする
// ことで、ダッシュボードでレガシーキーを無効化するまでの移行期間を安全に橋渡しする。

function fromDict(envVar: string): string | null {
  const raw = Deno.env.get(envVar)
  if (!raw) return null
  try {
    const dict = JSON.parse(raw) as Record<string, string>
    return dict['default'] ?? Object.values(dict)[0] ?? null
  } catch {
    return null
  }
}

export function getSecretKey(): string {
  const key = fromDict('SUPABASE_SECRET_KEYS') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!key) throw new Error('SUPABASE_SECRET_KEYS / SUPABASE_SERVICE_ROLE_KEY が未設定です。')
  return key
}

export function getPublishableKey(): string {
  const key = fromDict('SUPABASE_PUBLISHABLE_KEYS') ?? Deno.env.get('SUPABASE_ANON_KEY')
  if (!key) throw new Error('SUPABASE_PUBLISHABLE_KEYS / SUPABASE_ANON_KEY が未設定です。')
  return key
}
