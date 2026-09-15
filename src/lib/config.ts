export type PublicConfig =
  | { ready: true; url: string; publishableKey: string }
  | { ready: false; reason: 'missing' | 'invalid-url' | 'invalid-key' }

export const publicConfigNames = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']

/** Vercel adds framework metadata; only our two public settings reach the client. */
export function validateBuildConfig(env: Record<string, unknown>) {
  const unexpected = Object.keys(env).filter(name => name.startsWith('VITE_')
    && !publicConfigNames.includes(name) && !name.startsWith('VITE_VERCEL_'))
  if (unexpected.length) {
    throw new Error(`Unsupported public environment variable names: ${unexpected.sort().join(', ')}. Use only ${publicConfigNames.join(' and ')} for app settings.`)
  }
  if (env.VERCEL === '1' && publicConfigNames.some(name => !env[name])) {
    throw new Error(`Set ${publicConfigNames.join(' and ')} in Vercel Environment Variables, including the VITE_ prefix.`)
  }
  // Check each supplied value even when the other setting is missing locally.
  const checked = readPublicConfig({
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL || 'https://placeholder.invalid',
    VITE_SUPABASE_PUBLISHABLE_KEY: env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_placeholder',
  })
  if (!checked.ready) throw new Error('Invalid public Supabase configuration. Never use an administrative key in frontend configuration.')
}

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
