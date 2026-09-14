import { loadEnv } from 'vite'
import { readPublicConfig } from '../src/lib/config.ts'

const config = readPublicConfig({ ...loadEnv('development', process.cwd(), 'VITE_'), ...process.env })
if (!config.ready) {
  console.error(`Public Supabase configuration is ${config.reason}. See .env.example and docs/SETUP.md.`)
  process.exitCode = 1
} else {
  try {
    const response = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.publishableKey },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const settings = await response.json()
    if (!settings || typeof settings !== 'object' || !('external' in settings)) {
      throw new Error('Unexpected Auth settings response')
    }
    console.log('Supabase Auth is reachable with the public key. No data was changed.')
    console.log('Schema, RLS and account verification remain separate checks.')
  } catch (error) {
    // Do not print fetch URLs, headers, or credentials.
    console.error(error instanceof Error && /^HTTP \d+$/.test(error.message)
      ? `Connection check failed: ${error.message}.`
      : 'Connection check failed. Check the project status, URL, key and network.')
    process.exitCode = 1
  }
}
