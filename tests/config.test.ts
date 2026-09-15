import assert from 'node:assert/strict'
import { test } from 'node:test'
import { publicConfigNames, readPublicConfig, validateBuildConfig } from '../src/lib/config.ts'
import { resolveConfig } from 'vite'

const env = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example' }
const jwt = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature`

test('Vercel framework metadata does not block a configured build', () => {
  assert.doesNotThrow(() => validateBuildConfig({ ...env, VERCEL: '1', VITE_VERCEL_ENV: 'production', VITE_VERCEL_GIT_COMMIT_SHA: 'example' }))
})

test('Vercel requires the prefixed settings and errors never include their values', () => {
  assert.throws(() => validateBuildConfig({ VERCEL: '1', SUPABASE_URL: env.VITE_SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: env.VITE_SUPABASE_PUBLISHABLE_KEY }), /including the VITE_ prefix/)
  assert.throws(() => validateBuildConfig({ ...env, VITE_SERVICE_ROLE_KEY: 'private-value' }), error => {
    assert.ok(error instanceof Error)
    assert.ok(error.message.includes('VITE_SERVICE_ROLE_KEY'))
    assert.ok(!error.message.includes('private-value'))
    return true
  })
  assert.throws(() => validateBuildConfig({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_private' }), /Invalid public Supabase configuration/)
})

test('Vercel metadata is excluded from Vite client environment', async () => {
  const previous = process.env.VITE_VERCEL_ENV
  process.env.VITE_VERCEL_ENV = 'production'
  try {
    const config = await resolveConfig({ configFile: false, envDir: false, envPrefix: publicConfigNames }, 'build')
    assert.equal(config.env.VITE_VERCEL_ENV, undefined)
  } finally {
    if (previous === undefined) delete process.env.VITE_VERCEL_ENV
    else process.env.VITE_VERCEL_ENV = previous
  }
})

test('missing configuration is handled before client initialization', () => {
  assert.deepEqual(readPublicConfig({}), { ready: false, reason: 'missing' })
})

test('accepts publishable keys and normalizes the URL', () => {
  assert.deepEqual(readPublicConfig({ ...env, VITE_SUPABASE_URL: `${env.VITE_SUPABASE_URL}/` }), {
    ready: true, url: env.VITE_SUPABASE_URL, publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
  })
})

test('rejects secrets, privileged JWTs and malformed keys without echoing them', () => {
  for (const key of ['sb_secret_private', jwt('service_role'), jwt('authenticated'), 'broken']) {
    const result = readPublicConfig({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: key })
    assert.deepEqual(result, { ready: false, reason: 'invalid-key' })
    assert.ok(!JSON.stringify(result).includes(key))
  }
})

test('allows a local anon key', () => {
  assert.equal(readPublicConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') }).ready, true)
})

test('rejects insecure remote URLs and embedded URL credentials', () => {
  for (const url of ['http://example.supabase.co', 'https://user:password@example.supabase.co', 'not a url', 'https://example.supabase.co?key=secret', 'https://example.supabase.co/auth']) {
    assert.deepEqual(readPublicConfig({ ...env, VITE_SUPABASE_URL: url }), { ready: false, reason: 'invalid-url' })
  }
})
