export type PublicConfig =
  | { ready: true; url: string; publishableKey: string }
  | { ready: false; reason: 'missing' | 'invalid-url' | 'invalid-key' }

/** Accept only browser-safe credentials. Never include supplied values in errors. */
export function readPublicConfig(env: Record<string, unknown>): PublicConfig {
  const url = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim() : ''
  const key = typeof env.VITE_SUPABASE_PUBLISHABLE_KEY === 'string'
    ? env.VITE_SUPABASE_PUBLISHABLE_KEY.trim() : ''
  if (!url || !key) return { ready: false, reason: 'missing' }

  try {
    const parsed = new URL(url)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    if ((parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))
      || parsed.username || parsed.password || parsed.search || parsed.hash
      || parsed.pathname !== '/') return { ready: false, reason: 'invalid-url' }
  } catch {
    return { ready: false, reason: 'invalid-url' }
  }

  // Local Supabase may still provide legacy anon JWTs. A role claim is checked
  // only to reject accidental privileged keys; the server verifies signatures.
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key)
  if (!publicKey) {
    try {
      const parts = key.split('.')
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }
      publicKey = parts.length === 3 && payload.role === 'anon'
    } catch {
      publicKey = false
    }
  }
  if (!publicKey) return { ready: false, reason: 'invalid-key' }
  return { ready: true, url: url.replace(/\/$/, ''), publishableKey: key }
}
