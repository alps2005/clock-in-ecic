import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { readPublicConfig } from './src/lib/config.ts'

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  const allowed = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']
  if (Object.keys(env).some(name => name.startsWith('VITE_') && !allowed.includes(name))) {
    throw new Error('Only the documented public Supabase variables may use the VITE_ prefix.')
  }
  // Validate provided values before Vite can embed them, even if the other value is missing.
  const checked = readPublicConfig({
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL || 'https://placeholder.invalid',
    VITE_SUPABASE_PUBLISHABLE_KEY: env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_placeholder',
  })
  if (!checked.ready) throw new Error('Invalid public Supabase configuration. Never use an administrative key in frontend configuration.')
  return { plugins: [react(), tailwindcss()], server: { host: true } }
})
