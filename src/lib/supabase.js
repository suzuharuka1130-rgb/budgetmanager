import { createClient } from '@supabase/supabase-js'

const URL_KEY = 'budget_supabase_url'
const ANON_KEY = 'budget_supabase_anon_key'

export function getCredentials() {
  return {
    url: localStorage.getItem(URL_KEY) || '',
    anonKey: localStorage.getItem(ANON_KEY) || '',
  }
}

export function saveCredentials(url, anonKey) {
  localStorage.setItem(URL_KEY, url.trim())
  localStorage.setItem(ANON_KEY, anonKey.trim())
  client = null // force re-create on next access
}

export function hasCredentials() {
  const { url, anonKey } = getCredentials()
  return Boolean(url && anonKey)
}

let client = null

export function getClient() {
  if (!hasCredentials()) return null
  if (!client) {
    const { url, anonKey } = getCredentials()
    client = createClient(url, anonKey)
  }
  return client
}
