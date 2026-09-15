import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import { publicConfigNames, validateBuildConfig } from './src/lib/config.ts'

function localCameraCertificate(): Plugin {
  return {
    name: 'local-camera-certificate',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/ecic-root-ca.cer', (_request, response) => {
        const certificate = resolve('.certs.local/ecic-root-ca.cer')
        if (!existsSync(certificate)) { response.statusCode = 404; response.end('Run npm run dev:https first.'); return }
        response.setHeader('Content-Type', 'application/pkix-cert')
        response.setHeader('Cache-Control', 'no-store')
        response.end(readFileSync(certificate))
      })
    },
  }
}
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  validateBuildConfig(env)
  return {
    envPrefix: publicConfigNames,
    plugins: [react(), tailwindcss(), localCameraCertificate()],
    server: {
      host: true,
      https: mode === 'local-https' ? {
        key: readFileSync(resolve('.certs.local/server-key.pem')),
        cert: readFileSync(resolve('.certs.local/server.pem')),
      } : undefined,
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.certs.local/**'] },
    },
  }
})
