import { createClient } from '@supabase/supabase-js'
import { handleTeacherAdmin } from './handler.ts'

// Credentials exist only in the Edge Function environment, never in Vite.
Deno.serve((request: Request) => {
  const url = Deno.env.get('SUPABASE_URL')!
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const deadline = AbortSignal.timeout(60_000)
  const options = {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline }) },
  }
  const caller = createClient(url, publicKey, { ...options, global: { ...options.global, headers: { Authorization: request.headers.get('Authorization') ?? '' } } })
  const service = createClient(url, secret, options)
  return handleTeacherAdmin(request, caller, service)
})
