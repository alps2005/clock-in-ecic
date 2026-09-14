import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import { readPublicConfig } from './config'

export const config = readPublicConfig({ VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY })
export const supabase = config.ready ? createClient<Database>(config.url, config.publishableKey, {
  global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: init?.signal ?? AbortSignal.timeout(15_000) }) },
  auth: { storageKey: 'ecic-clock-in-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
}) : null
